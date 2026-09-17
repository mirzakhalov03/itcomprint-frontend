const DAY_MS = 24 * 60 * 60 * 1000;

/** Mirrors the backend's retention window; per-item countdowns use the server's purgeAt. */
export const TRASH_RETENTION_DAYS = 45;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Today as YYYY-MM-DD in local time (toISOString is UTC: yesterday before 05:00 in Tashkent). */
export function todayLocal(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Whole days until an ISO timestamp, never negative. */
export function daysUntil(iso: string): number {
  return Math.max(Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS), 0);
}
