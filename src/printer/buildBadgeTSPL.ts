const DPI = 203;

/**
 * Assembles a complete TSPL job as a binary Uint8Array.
 * Text commands are ASCII; bitmap data follows the BITMAP command inline.
 * Returns Uint8Array so WebUSB can transferOut() directly without TextEncoder
 * (which would corrupt bytes > 127 in the bitmap).
 */
export function buildBadgeTSPL(
  bitmap: Uint8Array<ArrayBuffer>,
  widthMm: number,
  heightMm: number,
): Uint8Array<ArrayBuffer> {
  const widthDots = Math.round((widthMm * DPI) / 25.4);
  const heightDots = Math.round((heightMm * DPI) / 25.4);
  const bytesPerRow = Math.ceil(widthDots / 8);

  const header =
    `SIZE ${widthMm} mm, ${heightMm} mm\n` +
    `GAP 2 mm, 0 mm\n` +
    `DIRECTION 1\n` +
    `CLS\n` +
    `BITMAP 0,0,${bytesPerRow},${heightDots},0,`;

  const footer = `\nPRINT 1\n`;

  const enc = new TextEncoder();
  const headerBytes = enc.encode(header);
  const footerBytes = enc.encode(footer);

  const out = new Uint8Array(headerBytes.length + bitmap.length + footerBytes.length);
  out.set(headerBytes, 0);
  out.set(bitmap, headerBytes.length);
  out.set(footerBytes, headerBytes.length + bitmap.length);
  return out;
}
