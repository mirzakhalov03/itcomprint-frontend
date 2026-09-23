import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AppEvent } from '../types';

export const eventsQueryOptions = queryOptions({ queryKey: ['events'], queryFn: api.listEvents });

export function useEvents() {
  return useQuery({ ...eventsQueryOptions, refetchOnWindowFocus: true });
}

export function useSheetTabs() {
  // Always refetch on open — tabs get reserved/freed as events are created and deleted.
  return useQuery({ queryKey: ['sheet-tabs'], queryFn: api.listSheetTabs, staleTime: 0 });
}

export function useCreateEventFromSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; date: string; tabGid: number }) =>
      api.createEventFromSheet(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
    // Success or 409, the tab list is now out of date.
    onSettled: () => qc.invalidateQueries({ queryKey: ['sheet-tabs'] }),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, ...payload }: { eventId: string; name: string; date: string }) =>
      api.updateEvent(eventId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

function removeEvent(events: AppEvent[] | undefined, eventId: string) {
  return events?.filter((e) => e._id !== eventId);
}

export function useTrashEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => api.trashEvent(eventId),
    // Drop it from the cached list immediately — don't wait on a background
    // refetch to land before the card disappears.
    onSuccess: (_event, eventId) => {
      qc.setQueryData<AppEvent[]>(['events'], (old) => removeEvent(old, eventId));
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useTrash() {
  return useQuery({ queryKey: ['events', 'trash'], queryFn: api.listTrash });
}

export function useRestoreEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => api.restoreEvent(eventId),
    onSuccess: (_event, eventId) => {
      qc.setQueryData<AppEvent[]>(['events', 'trash'], (old) => removeEvent(old, eventId));
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['events', 'trash'] });
    },
  });
}

export function usePermanentDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => api.permanentDeleteEvent(eventId),
    onSuccess: (_result, eventId) => {
      qc.setQueryData<AppEvent[]>(['events', 'trash'], (old) => removeEvent(old, eventId));
      qc.invalidateQueries({ queryKey: ['events', 'trash'] });
      qc.invalidateQueries({ queryKey: ['sheet-tabs'] });
    },
  });
}
