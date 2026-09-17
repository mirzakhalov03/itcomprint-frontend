import type { Attendee, TemplateZone } from '../types';

type ZoneSource = Pick<Attendee, 'fullName' | 'extra'>;

/** The text a zone prints for an attendee — the single definition used by print and every preview. */
export function resolveZoneText(zone: TemplateZone, attendee: ZoneSource): string {
  if (zone.type === 'static') return zone.staticText ?? '';
  if (zone.field === 'fullName') return attendee.fullName;
  return attendee.extra[zone.field ?? ''] ?? '';
}

const baseZone = { fontFamily: 'Inter', bold: false, align: 'center', hidden: false } as const;

export const newFieldZone = (): TemplateZone => ({
  ...baseZone,
  id: crypto.randomUUID(),
  type: 'field',
  field: 'fullName',
  fontSize: 16,
});

export const newStaticZone = (): TemplateZone => ({
  ...baseZone,
  id: crypto.randomUUID(),
  type: 'static',
  staticText: '',
  fontSize: 14,
});
