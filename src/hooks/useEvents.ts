import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { NewAttendee } from '../types';

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
