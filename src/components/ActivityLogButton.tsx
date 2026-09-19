import { useState } from 'react';
import { HistoryIcon } from './icons';
import { ActivityLogDialog } from './ActivityLogDialog';

/** Top-bar entry point for the activity log. Scoped to the event on the kiosk. */
export function ActivityLogButton({ eventId }: { eventId?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Activity log"
        title="Activity log"
        className="flex h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-faint transition-colors hover:bg-white/10 hover:text-white sm:px-2.5"
      >
        <HistoryIcon size={17} />
        <span className="hidden font-display text-[13px] font-semibold lg:inline">Activity</span>
      </button>
      {open && <ActivityLogDialog eventId={eventId} onClose={() => setOpen(false)} />}
    </>
  );
}
