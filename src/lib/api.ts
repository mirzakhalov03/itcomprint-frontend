import type {
  AppEvent,
  Attendee,
  AuthUser,
  BadgeTemplate,
  NewAttendee,
  SheetSyncResult,
  TemplateInput,
} from '../types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  readonly status: number;
  // erasableSyntaxOnly forbids TS parameter properties, so assign explicitly.
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

// Used when the server sends no usable `message` (e.g. auth guard 401, Zod 400, body-parser 413).
const FALLBACK_MESSAGES: Record<number, string> = {
  400: 'Some details look invalid — check them and try again.',
  401: 'Your session expired — sign in again.',
  413: 'That spreadsheet is too large — split it into smaller files.',
};

async function toApiError(res: Response): Promise<ApiError> {
  let message: string | undefined;
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === 'string') message = body.message;
  } catch {
    // non-JSON body (proxy error page, empty 5xx)
  }
  // body-parser's 413 message ("request entity too large") isn't operator-friendly.
  if (res.status === 413) message = undefined;
  return new ApiError(
    res.status,
    message ?? FALLBACK_MESSAGES[res.status] ?? `Something went wrong (${res.status}) — try again.`,
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listEvents: () => request<AppEvent[]>('/events'),

  createEvent: (payload: { name: string; date: string; attendees: NewAttendee[] }) =>
    request<AppEvent>('/events', { method: 'POST', body: JSON.stringify(payload) }),

  createEventFromSheet: (payload: { name: string; date: string; sheetUrl: string }) =>
    request<AppEvent & SheetSyncResult>('/events/sheet', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  syncEventSheet: (eventId: string) =>
    request<SheetSyncResult>(`/events/${eventId}/sync-sheet`, { method: 'POST' }),

  listAttendees: (eventId: string) => request<Attendee[]>(`/events/${eventId}/attendees`),

  printAttendee: (attendeeId: string) =>
    request<Attendee>(`/attendees/${attendeeId}/print`, { method: 'POST' }),

  unprintAttendee: (attendeeId: string) =>
    request<Attendee>(`/attendees/${attendeeId}/print`, { method: 'DELETE' }),

  listTemplates: () => request<BadgeTemplate[]>('/templates'),

  templateFieldKeys: () => request<string[]>('/templates/field-keys'),

  createTemplate: (payload: TemplateInput) =>
    request<BadgeTemplate>('/templates', { method: 'POST', body: JSON.stringify(payload) }),

  updateTemplate: (id: string, payload: TemplateInput) =>
    request<BadgeTemplate>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  deleteTemplate: (id: string) =>
    request<{ ok: boolean }>(`/templates/${id}`, { method: 'DELETE' }),

  setEventTemplate: (eventId: string, templateId: string | null) =>
    request<AppEvent>(`/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify({ templateId }),
    }),

  updateEvent: (eventId: string, payload: { name: string; date: string }) =>
    request<AppEvent>(`/events/${eventId}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  trashEvent: (eventId: string) => request<AppEvent>(`/events/${eventId}`, { method: 'DELETE' }),

  listTrash: () => request<AppEvent[]>('/events/trash'),

  restoreEvent: (eventId: string) =>
    request<AppEvent>(`/events/${eventId}/restore`, { method: 'POST' }),

  permanentDeleteEvent: (eventId: string) =>
    request<{ ok: boolean }>(`/events/${eventId}/permanent`, { method: 'DELETE' }),

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
    if (!res.ok) throw await toApiError(res);
    const data = (await res.json()) as { user: AuthUser };
    return data.user;
  },

  updateMe: (displayName: string) =>
    request<{ user: AuthUser }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    }),

  logout: () => request<void>('/auth/logout', { method: 'POST' }),
};
