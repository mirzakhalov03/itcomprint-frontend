import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AppEvent, NewAttendee } from '../types';

export function useEvents() {
  return useQuery({ queryKey: ['events'], queryFn: api.listEvents, refetchOnWindowFocus: true });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; date: string; attendees: NewAttendee[] }) =>
      api.createEvent(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useCreateEventFromSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; date: string; sheetUrl: string }) =>
      api.createEventFromSheet(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
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
    },
  });
}
