import type { ReactNode } from 'react';
import { PrinterStatus } from './PrinterStatus';

/**
 * Dark top bar shared by the dashboard shell and the kiosk: an optional left
 * control (menu toggle or back link), the section/event title, and the printer
 * status pill pinned to the right.
 */
export function AppHeader({ title, leftSlot }: { title: string; leftSlot?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 bg-ink px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3.5">
        {leftSlot}
        <span className="truncate font-display text-[15px] font-bold tracking-[.03em] text-white">
          {title}
        </span>
      </div>
      <PrinterStatus />
    </header>
  );
}
