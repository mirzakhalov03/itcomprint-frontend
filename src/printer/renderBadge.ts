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

// Names always print on two lines, regardless of width — first word on line 1,
// the rest on line 2 (empty if there's no space) — never collapsed to one line.
function splitNameTwoLines(text: string): [string, string] {
  const spaceIdx = text.indexOf(' ');
  if (spaceIdx === -1) return [text, ''];
  return [text.slice(0, spaceIdx), text.slice(spaceIdx + 1)];
}

// Greedy word-wrap: as many words per line as fit maxWidth. A single word wider
// than maxWidth stays alone on its line — fillText's maxWidth arg compresses it
// as a last resort so it still doesn't bleed off the label edge.
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ').filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
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
  const PADDING = Math.round(widthDots * 0.04);
  const maxWidth = widthDots - PADDING * 2;
  ctx.textBaseline = 'top';

  // First pass: set each zone's font (needed for accurate measurement) and wrap
  // its text — a zone's height now depends on how many lines it wrapped to.
  const zoneLines = visible.map((z) => {
    // Convert pt to dots: 1 inch = 72pt = DPI dots
    const fontSizeDots = (z.fontSize / 72) * DPI;
    ctx.font = `${z.bold ? 'bold ' : ''}${fontSizeDots}px '${z.fontFamily}'`;
    const text = resolveZoneText(z, attendee);
    return {
      lines: z.field === 'fullName' ? splitNameTwoLines(text) : wrapText(ctx, text, maxWidth),
      lineHeight: Math.ceil(fontSizeDots * 1.3),
      fontSizeDots,
    };
  });

  const totalH =
    zoneLines.reduce((sum, z) => sum + z.lineHeight * z.lines.length, 0) +
    GAP_DOTS * Math.max(0, visible.length - 1);
  let y = Math.max(4, Math.round((heightDots - totalH) / 2));

  ctx.fillStyle = '#000000';

  for (let i = 0; i < visible.length; i++) {
    const z = visible[i];
    const { lines, lineHeight, fontSizeDots } = zoneLines[i];
    ctx.font = `${z.bold ? 'bold ' : ''}${fontSizeDots}px '${z.fontFamily}'`;
    ctx.textAlign = z.align;
    const x =
      z.align === 'left' ? PADDING : z.align === 'right' ? widthDots - PADDING : widthDots / 2;

    for (const line of lines) {
      ctx.fillText(line, x, y, maxWidth);
      y += lineHeight;
    }
    y += i < visible.length - 1 ? GAP_DOTS : 0;
  }

  return canvas;
}

export function canvasToMonochromeBitmap(canvas: HTMLCanvasElement): Uint8Array<ArrayBuffer> {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);

  const bytesPerRow = Math.ceil(width / 8);
  // TSPL BITMAP polarity is inverted: a 0 bit burns a dot, a 1 bit leaves the
  // label blank. Start all-white (0xff) so every untouched pixel prints nothing —
  // including the padding bits that round each row up to a whole byte, which
  // would otherwise burn a black stripe down the right edge.
  const bitmap = new Uint8Array(bytesPerRow * height).fill(0xff);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const px = (row * width + col) * 4;
      const luminance = 0.299 * data[px] + 0.587 * data[px + 1] + 0.114 * data[px + 2];
      if (luminance <= 128) {
        // black pixel — clear the bit (MSB first) so the printer burns this dot
        bitmap[row * bytesPerRow + Math.floor(col / 8)] &= ~(1 << (7 - (col % 8)));
      }
    }
  }

  return bitmap;
}
