import { Link } from 'react-router-dom';
import { CalendarIcon, CheckIcon, UsersIcon } from './icons';
import type { AppEvent } from '../types';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** One event tile on the dashboard. Clicking opens its full-screen kiosk. */
export function EventCard({ event }: { event: AppEvent }) {
  const total = event.attendeeCount ?? 0;
  const printed = event.printedCount ?? 0;
  const remaining = Math.max(total - printed, 0);

  return (
    <Link
      to={`/app/events/${event._id}`}
      className="group flex flex-col rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.04)] transition-all hover:border-brand-line hover:shadow-[0_8px_24px_rgba(0,0,0,.06)]"
    >
      <div className="font-display text-[17px] font-bold text-ink group-hover:text-brand-deep">
        {event.name}
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
  );
}
