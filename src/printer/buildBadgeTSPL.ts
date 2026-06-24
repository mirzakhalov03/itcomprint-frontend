import type { Attendee, BadgeTemplate, TemplateZone } from '../types';

const DPI = 203; // fixed for now — see spec assumption
const FONT = '3'; // Gainscha built-in bitmap font used for every zone

export interface BadgeLine {
  text: string;
  fontSize: number; // 1–8 scale
  bold: boolean;
  align: 'left' | 'center' | 'right';
}

/** Sample attendee used to preview a template in the editor. */
export const SAMPLE_ATTENDEE: Pick<Attendee, 'fullName' | 'extra'> = {
  fullName: 'Jane Cooper',
  extra: { company: 'Acme Corp', role: 'Speaker' },
};

const clampScale = (n: number) => Math.min(8, Math.max(1, Math.round(n)));

function zoneValue(attendee: Pick<Attendee, 'fullName' | 'extra'>, zone: TemplateZone): string {
  if (zone.field === 'fullName') return attendee.fullName;
  return attendee.extra[zone.field] ?? ''; // absent column → empty, never an error
}

/** Visible zones as preview lines — the single source for both on-screen previews. */
export function renderBadgeLines(
  attendee: Pick<Attendee, 'fullName' | 'extra'>,
  template: BadgeTemplate,
): BadgeLine[] {
  return template.zones
    .filter((z) => !z.hidden)
    .map((z) => ({
      text: zoneValue(attendee, z),
      fontSize: clampScale(z.fontSize),
      bold: z.bold,
      align: z.align,
    }));
}

const ALIGN_TSPL: Record<TemplateZone['align'], number> = { left: 1, center: 2, right: 3 };

/** Render a badge to TSPL for the given attendee and template. */
export function buildBadgeTSPL(
  attendee: Pick<Attendee, 'fullName' | 'extra'>,
  template: BadgeTemplate,
): string {
  const dotsPerMm = DPI / 25.4;
  const widthDots = Math.round(template.labelWidthMm * dotsPerMm);
  const heightDots = Math.round(template.labelHeightMm * dotsPerMm);
  const gap = Math.round(2 * dotsPerMm);

  const visible = template.zones.filter((z) => !z.hidden);
  const heights = visible.map((z) => clampScale(z.fontSize) * 24); // ~24 dots/scale for FONT "3"
  const totalH = heights.reduce((a, b) => a + b, 0) + gap * Math.max(0, visible.length - 1);
  let y = Math.max(0, Math.round((heightDots - totalH) / 2)); // vertically center the stack

  const lines = [
    `SIZE ${template.labelWidthMm} mm, ${template.labelHeightMm} mm`,
    'GAP 2 mm, 0 mm',
    'DIRECTION 1',
    'CLS',
  ];

  visible.forEach((z, i) => {
    const scale = clampScale(z.fontSize);
    const h = heights[i];
    const align = ALIGN_TSPL[z.align];
    const text = zoneValue(attendee, z).replace(/"/g, "'"); // TSPL strings are double-quoted
    // BLOCK x,y,width,height,"font",rotation,x-mul,y-mul,space,align,"content"
    lines.push(`BLOCK 0,${y},${widthDots},${h},"${FONT}",0,${scale},${scale},0,${align},"${text}"`);
    // Bold has no TSPL flag for bitmap fonts — double-strike offset by 1 dot.
    if (z.bold) {
      lines.push(
        `BLOCK 1,${y},${widthDots},${h},"${FONT}",0,${scale},${scale},0,${align},"${text}"`,
      );
    }
    y += h + gap;
  });

  lines.push('PRINT 1', '');
  return lines.join('\n');
}
