import { cn } from '../lib/cn';

/** At-a-glance attendance: arrivals lead, the roster total recedes behind it. */
export function AttendeeStats({
  total,
  came,
  className,
}: {
  total: number;
  came: number;
  className?: string;
}) {
  const pct = total ? Math.round((came / total) * 100) : 0;

  return (
    <div
      className={cn(
        'relative flex h-10.5 items-center gap-3.5 overflow-hidden rounded-[10px] border border-line-2 bg-surface pb-0.5 pl-3.5 pr-3',
        className,
      )}
    >
      <div className="flex flex-col justify-center">
        <span className="font-display text-[9.5px] font-semibold uppercase leading-none tracking-[.1em] text-faint">
          Total
        </span>
        <span className="mt-0.75 flex items-baseline gap-1 font-display leading-none tabular-nums">
          <span className="text-[21px] font-bold tracking-[-.01em] text-brand-deep">
            {came.toLocaleString()}
          </span>
          <span className="text-[12px] font-semibold text-faint">/ {total.toLocaleString()}</span>
        </span>
      </div>
      <span className="ml-auto rounded-md bg-brand-tint px-1.5 py-0.75 font-display text-[11px] font-bold leading-none text-brand-deep tabular-nums">
        {pct}%
      </span>
      {/* Arrival progress along the bottom edge */}
      <div className="absolute inset-x-0 bottom-0 h-0.75 bg-line-3">
        <div
          className="h-full rounded-r-full bg-brand transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
