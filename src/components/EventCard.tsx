import { useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarIcon,
  CheckIcon,
  UsersIcon,
  MoreVerticalIcon,
  PencilIcon,
  TrashIcon,
} from './icons';
import { EditEventDialog } from './EditEventDialog';
import { MoveToTrashDialog } from './MoveToTrashDialog';
import { useClickOutside } from '../hooks/useClickOutside';
import type { AppEvent } from '../types';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Card menu items stop propagation/default so they don't trigger the card's Link navigation. */
function stop(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}

/** One event tile on the dashboard. Clicking opens its full-screen kiosk. */
export function EventCard({ event }: { event: AppEvent }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<'none' | 'edit' | 'trash'>('none');
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, menuOpen, () => setMenuOpen(false));

  const total = event.attendeeCount ?? 0;
  const printed = event.printedCount ?? 0;
  const remaining = Math.max(total - printed, 0);

  return (
    <>
      <Link
        to={`/app/events/${event._id}`}
        className="group flex flex-col rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.04)] transition-all hover:border-brand-line hover:shadow-[0_8px_24px_rgba(0,0,0,.06)]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="font-display text-[17px] font-bold text-ink group-hover:text-brand-deep">
            {event.name}
          </div>
          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={(e) => {
                stop(e);
                setMenuOpen((v) => !v);
              }}
              aria-label="Event actions"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-surface hover:text-ink"
            >
              <MoreVerticalIcon size={16} />
            </button>
            {menuOpen && (
              <div
                onClick={stop}
                className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-brand-line bg-brand-tint shadow-lg"
              >
                <button
                  onClick={(e) => {
                    stop(e);
                    setMenuOpen(false);
                    setDialog('edit');
                  }}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-ink hover:bg-white/60"
                >
                  <PencilIcon size={14} /> Edit
                </button>
                <button
                  onClick={(e) => {
                    stop(e);
                    setMenuOpen(false);
                    setDialog('trash');
                  }}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-danger hover:bg-danger/10"
                >
                  <TrashIcon size={14} /> Move to trash
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <CalendarIcon size={14} className="text-faint" />
          {fmtDate(event.date)}
        </div>

        <div className="mt-4 flex items-center gap-4 border-t border-line-3 pt-3.5 text-[13px]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink-3">
            <UsersIcon size={15} className="text-faint" /> {total}
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-brand-deep">
            <CheckIcon size={14} /> {printed}
          </span>
          <span className="font-semibold text-amber-ink">{remaining} left</span>
        </div>

        {event.authorName && <div className="mt-3 text-xs text-faint">by {event.authorName}</div>}
      </Link>

      {dialog === 'edit' && <EditEventDialog event={event} onClose={() => setDialog('none')} />}
      {dialog === 'trash' && <MoveToTrashDialog event={event} onClose={() => setDialog('none')} />}
    </>
  );
}
