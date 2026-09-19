import type { ReactNode } from 'react';
import { PrinterStatus } from './PrinterStatus';
import { ActivityLogButton } from './ActivityLogButton';

/**
 * Dark top bar shared by the dashboard shell and the kiosk: an optional left
 * control (menu toggle or back link), the section/event title, and the printer
 * status pill pinned to the right. `eventId` (kiosk only) scopes the activity log
 * and printer reports to that event.
 */
export function AppHeader({
  title,
  leftSlot,
  eventId,
}: {
  title: string;
  leftSlot?: ReactNode;
  eventId?: string;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 bg-ink px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3.5">
        {leftSlot}
        <span className="truncate font-display text-[15px] font-bold tracking-[.03em] text-white">
          {title}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <ActivityLogButton eventId={eventId} />
        <PrinterStatus eventId={eventId} />
      </div>
    </header>
  );
}
