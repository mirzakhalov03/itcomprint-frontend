import { cn } from '../lib/cn';

export interface RouteCount {
  label: string;
  total: number;
  came: number;
}

/** Bus chips beside search: one click narrows the roster (and stats) to that bus. */
export function BusRouteFilter({
  counts,
  active,
  onChange,
}: {
  counts: RouteCount[];
  active: string | null;
  onChange: (label: string | null) => void;
}) {
  if (counts.length === 0) return null;
  return (
    <div role="group" aria-label="Filter by bus" className="flex shrink-0 flex-wrap gap-2">
      {counts.map((c) => {
        const on = c.label === active;
        return (
          <button
            key={c.label}
            onClick={() => onChange(on ? null : c.label)}
            aria-pressed={on}
            className={cn(
              'flex h-10.5 items-center gap-2 rounded-[10px] border px-3 font-display text-sm font-semibold transition-colors',
              on
                ? 'border-brand bg-brand-tint text-brand-deep'
                : 'border-line-2 bg-surface text-ink hover:border-brand/40',
            )}
          >
            <span aria-hidden>🚌</span>
            {c.label}
            <span className="text-[12px] tabular-nums text-faint">
              {c.came}/{c.total}
            </span>
          </button>
        );
      })}
    </div>
  );
}
