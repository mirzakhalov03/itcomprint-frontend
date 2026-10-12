import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Attendee } from '../types';

/** One definition of the roster query, shared by the table and the live-sync poller. */
export const attendeesQueryOptions = (eventId: string) =>
  queryOptions({ queryKey: ['attendees', eventId], queryFn: () => api.listAttendees(eventId) });

/**
 * Loads the full attendee list for an event. Search, status filtering and
 * segment counts are derived client-side — instant under pressure, no round-trip per keystroke.
 */
export function useAttendees(eventId: string | null) {
  return useQuery({ ...attendeesQueryOptions(eventId ?? ''), enabled: !!eventId });
}

/** Adds a walk-in to our roster only (never the sheet) and appends it to the cache. */
export function useAddAttendee(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fullName: string) => api.addAttendee(eventId, fullName),
    onSuccess: async (attendee) => {
      // Stop an in-flight poll from landing after the append and dropping the new row.
      await qc.cancelQueries({ queryKey: ['attendees', eventId] });
      qc.setQueryData<Attendee[]>(['attendees', eventId], (list) => [...(list ?? []), attendee]);
      void qc.invalidateQueries({ queryKey: ['events'], exact: true, refetchType: 'none' });
    },
  });
}
