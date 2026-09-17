import { queryOptions, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

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
