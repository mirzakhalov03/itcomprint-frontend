import type { BadgeLine } from '../printer/buildBadgeTSPL';

/**
 * A relative (not pixel-exact) preview of a printed label: a white card with
 * the label's aspect ratio, rendering the same zone lines the renderer emits.
 * Font size maps the 1–8 scale to px; alignment and bold mirror the zones.
 */
export function BadgePreview({
  lines,
  widthMm,
  heightMm,
  className = '',
}: {
  lines: BadgeLine[];
  widthMm: number;
  heightMm: number;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center overflow-hidden rounded-md border border-line bg-white px-3 py-2 text-center ${className}`}
      style={{ aspectRatio: `${widthMm} / ${heightMm}` }}
    >
      {lines.length === 0 ? (
        <span className="text-[11px] text-faint">Empty template</span>
      ) : (
        lines.map((line, i) => (
          <span
            key={i}
            className="block w-full truncate leading-tight text-ink"
            style={{
              fontSize: `${line.fontSize * 5 + 6}px`,
              fontWeight: line.bold ? 800 : 500,
              textAlign: line.align,
            }}
          >
            {line.text || ' '}
          </span>
        ))
      )}
    </div>
  );
}
