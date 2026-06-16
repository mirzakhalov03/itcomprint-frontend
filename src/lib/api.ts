import type { AppEvent, Attendee, NewAttendee } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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
};
