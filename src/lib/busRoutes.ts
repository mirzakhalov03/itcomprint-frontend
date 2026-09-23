import type { Attendee, BusRoute } from '../types';

/** Attendee id → label of the bus route one of their sheet answers belongs to. */
export function routeByAttendee(attendees: Attendee[], routes: BusRoute[]): Map<string, string> {
  const labelOf = new Map(routes.flatMap((r) => r.phrases.map((p) => [p, r.label] as const)));
  const out = new Map<string, string>();
  if (labelOf.size === 0) return out;
  for (const a of attendees) {
    const hit = Object.values(a.extra).find((v) => labelOf.has(v));
    if (hit) out.set(a._id, labelOf.get(hit)!);
  }
  return out;
}

/**
 * Moves a phrase to another route (index into `routes`) or a new one; emptied routes drop.
 * Moving — not removing — pins it: a removed phrase would be re-merged by the next sync.
 */
export function movePhrase(routes: BusRoute[], phrase: string, target: number | 'new'): BusRoute[] {
  const next = routes.map((r) => ({ ...r, phrases: r.phrases.filter((p) => p !== phrase) }));
  // autoLabel: the next sync swaps the raw phrase for the English city name.
  if (target === 'new')
    next.push({ label: phrase, autoLabel: true, phrases: [phrase], hidden: false });
  else next[target].phrases.push(phrase);
  return next.filter((r) => r.phrases.length > 0);
}

/** Why these routes can't be saved, or null. Mirrors the backend's Zod rules. */
export function busRoutesError(routes: BusRoute[]): string | null {
  const labels = routes.map((r) => r.label.trim().toLowerCase());
  if (labels.some((l) => !l)) return 'Every bus needs a name.';
  if (new Set(labels).size !== labels.length) return 'Two buses have the same name.';
  return null;
}
