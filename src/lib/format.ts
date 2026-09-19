import type { Attendee } from '../types';

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

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' });

/** "Today", "Yesterday", or a short date — for grouping feeds by day. */
export function dayLabel(iso: string): string {
  const day = new Date(iso).toDateString();
  const now = new Date();
  if (day === now.toDateString()) return 'Today';
  now.setDate(now.getDate() - 1); // calendar-aware, unlike subtracting 24h
  if (day === now.toDateString()) return 'Yesterday';
  return fmtDate(iso);
}

/** The attendee's registration ID as shown in the roster; sheet imports carry it in `extra`. */
export const regNumberOf = (a: Attendee) => a.registrantId ?? a.extra['Reg. Number'] ?? '';
