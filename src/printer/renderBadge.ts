import type { Attendee, BadgeTemplate, TemplateZone } from '../types';

const DPI = 203;

export const FONT_FAMILIES = [
  'Inter',
  'Roboto',
  'Montserrat',
  'Open Sans',
  'Raleway',
  'Courier New',
] as const;

export const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32] as const;

export const SAMPLE_ATTENDEE: Pick<Attendee, 'fullName' | 'extra'> = {
  fullName: 'Jane Cooper',
  extra: { company: 'Acme Corp', role: 'Speaker' },
};

const LEGACY_FONT_SIZE_MAP: Record<number, number> = {
  1: 8,
  2: 10,
  3: 12,
  4: 14,
  5: 16,
  6: 18,
  7: 20,
  8: 24,
};

// A zone is legacy iff it predates fontFamily/type. Detect by their ABSENCE —
// never by fontSize magnitude: the new pt scale includes 8, which would collide
// with the old 1–8 scale's max and silently remap a real 8pt zone to 24pt.
export function normalizeLegacyZone(z: TemplateZone): TemplateZone {
  const isLegacy = z.fontFamily == null || z.type == null;
  return {
    ...z,
    type: z.type ?? 'field',
    fontFamily: z.fontFamily ?? 'Inter',
    fontSize: isLegacy ? (LEGACY_FONT_SIZE_MAP[z.fontSize] ?? z.fontSize) : z.fontSize,
  };
}

function resolveZoneText(
  zone: TemplateZone,
  attendee: Pick<Attendee, 'fullName' | 'extra'>,
): string {
  if (zone.type === 'static') return zone.staticText ?? '';
  if (zone.field === 'fullName') return attendee.fullName;
  return attendee.extra[zone.field ?? ''] ?? '';
}

export async function renderBadgeToCanvas(
  attendee: Pick<Attendee, 'fullName' | 'extra'>,
  template: BadgeTemplate,
): Promise<HTMLCanvasElement> {
  const widthDots = Math.round((template.labelWidthMm * DPI) / 25.4);
  const heightDots = Math.round((template.labelHeightMm * DPI) / 25.4);

  const canvas = document.createElement('canvas');
  canvas.width = widthDots;
  canvas.height = heightDots;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthDots, heightDots);

  const visible = template.zones.map(normalizeLegacyZone).filter((z) => !z.hidden);
  if (visible.length === 0) return canvas;

  // Force-load each web font BEFORE drawing. document.fonts.ready alone does not
  // load a font that hasn't been used in the DOM yet — the print path renders
  // fully offscreen, so without this the first render falls back to a system font.
  const families = Array.from(new Set(visible.map((z) => z.fontFamily)));
  await Promise.all(families.map((f) => document.fonts.load(`16px '${f}'`).catch(() => undefined)));
  await document.fonts.ready;

  const GAP_DOTS = 4;
  // Convert pt to dots: 1 inch = 72pt = DPI dots
  const lineHeights = visible.map((z) => Math.ceil((z.fontSize / 72) * DPI * 1.3));
  const totalH =
    lineHeights.reduce((a, b) => a + b, 0) + GAP_DOTS * Math.max(0, visible.length - 1);
  let y = Math.max(4, Math.round((heightDots - totalH) / 2));

  ctx.fillStyle = '#000000';

  for (let i = 0; i < visible.length; i++) {
    const z = visible[i];
    const fontSizeDots = (z.fontSize / 72) * DPI;
    ctx.font = `${z.bold ? 'bold ' : ''}${fontSizeDots}px '${z.fontFamily}'`;
    ctx.textBaseline = 'top';
    ctx.textAlign = z.align;

    const PADDING = Math.round(widthDots * 0.04);
    const maxWidth = widthDots - PADDING * 2;
    const x =
      z.align === 'left' ? PADDING : z.align === 'right' ? widthDots - PADDING : widthDots / 2;

    ctx.fillText(resolveZoneText(z, attendee), x, y, maxWidth);
    y += lineHeights[i] + (i < visible.length - 1 ? GAP_DOTS : 0);
  }

  return canvas;
}

export function canvasToMonochromeBitmap(canvas: HTMLCanvasElement): Uint8Array<ArrayBuffer> {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);

  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = new Uint8Array(bytesPerRow * height);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const px = (row * width + col) * 4;
      const luminance = 0.299 * data[px] + 0.587 * data[px + 1] + 0.114 * data[px + 2];
      if (luminance <= 128) {
        // black pixel — set the corresponding bit (MSB first)
        bitmap[row * bytesPerRow + Math.floor(col / 8)] |= 1 << (7 - (col % 8));
      }
    }
  }

  return bitmap;
}
