import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * Loads the full attendee list for an event. Search, status filtering and
 * segment counts are derived client-side — for a bounded kiosk roster (~hundreds)
 * this keeps filtering instant under pressure and avoids a round-trip per keystroke.
 */
export function useAttendees(eventId: string | null) {
  return useQuery({
    queryKey: ['attendees', eventId],
    queryFn: () => api.listAttendees(eventId!, {}),
    enabled: !!eventId,
  });
}
