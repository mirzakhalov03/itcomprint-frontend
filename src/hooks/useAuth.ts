import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AuthUser } from '../types';

/** The single source of truth for who's signed in. */
export function useAuth() {
  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: api.me,
    staleTime: Infinity, // identity doesn't change without an explicit mutation
  });
  return { user: data ?? null, isLoading };
}

export function useGoogleLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idToken: string) => api.googleLogin(idToken),
    onSuccess: (res) => qc.setQueryData<AuthUser>(['auth', 'me'], res.user),
  });
}

export function useUpdateName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => api.updateMe(displayName),
    onSuccess: (res) => qc.setQueryData<AuthUser>(['auth', 'me'], res.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      qc.setQueryData(['auth', 'me'], null);
      qc.removeQueries({ queryKey: ['events'] });
      qc.removeQueries({ queryKey: ['attendees'] });
    },
  });
}
