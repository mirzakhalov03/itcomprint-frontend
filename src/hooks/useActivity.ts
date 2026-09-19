import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/** One page of the activity log: newest first, `before` = cursor of the page above. */
export function useActivity(eventId: string | undefined, before: string | null) {
  return useQuery({
    queryKey: ['activity', eventId ?? 'all', before],
    queryFn: () => api.listActivity({ eventId, before }),
    placeholderData: keepPreviousData, // keep rows on screen while the next page loads
    staleTime: 0, // an audit log is only useful if it's current the moment it's opened
  });
}
