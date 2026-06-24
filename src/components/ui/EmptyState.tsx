import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Centered "nothing here" panel. `bordered` draws the standalone white card used
 * on pages; drop it when the state lives inside an existing card (e.g. the
 * attendee table already supplies the chrome).
 */
export function EmptyState({
  title,
  subtitle,
  bordered = true,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  bordered?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'text-center',
        bordered ? 'rounded-2xl border border-line bg-white px-6 py-20' : 'px-6 py-16',
        className,
      )}
    >
      <div className="font-display text-[17px] font-bold text-ink-3">{title}</div>
      {subtitle && <div className="mt-1.5 text-sm text-muted">{subtitle}</div>}
    </div>
  );
}

/** Inline "loading…" row, matching the empty-state spacing. */
export function LoadingPanel({ children }: { children: ReactNode }) {
  return <div className="px-6 py-16 text-center text-sm text-muted">{children}</div>;
}
