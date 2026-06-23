import type { AppEvent, Attendee, AuthUser, NewAttendee } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listEvents: () => request<AppEvent[]>('/events'),

  createEvent: (payload: { name: string; date: string; attendees: NewAttendee[] }) =>
    request<AppEvent>('/events', { method: 'POST', body: JSON.stringify(payload) }),

  listAttendees: (eventId: string, params: { search?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.status) qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<Attendee[]>(`/events/${eventId}/attendees${suffix}`);
  },

  printAttendee: (attendeeId: string) =>
    request<Attendee>(`/attendees/${attendeeId}/print`, { method: 'POST' }),

  googleLogin: (idToken: string) =>
    request<{ user: AuthUser; isNewUser: boolean }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),

  // 401 means "no session" — return null instead of throwing, so the guard
  // can treat logged-out as a normal state rather than an error.
  me: async (): Promise<AuthUser | null> => {
    const res = await fetch(`${BASE}/auth/me`, { credentials: 'include' });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = (await res.json()) as { user: AuthUser };
    return data.user;
  },

  updateMe: (displayName: string) =>
    request<{ user: AuthUser }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    }),

  // logout returns 204 (no body), so don't route it through request().
  logout: async (): Promise<void> => {
    await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  },
};
