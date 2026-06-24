import { Link, useParams } from 'react-router-dom';
import { AttendeeTable } from '../components/AttendeeTable';
import { BadgePreviewTray } from '../components/BadgePreviewTray';
import { Toast } from '../components/Toast';
import { PrinterStatus } from '../components/PrinterStatus';
import { ArrowLeftIcon } from '../components/icons';
import { useEvents } from '../hooks/useEvents';

/** Full-screen, single-event badge-printing view. Event comes from the URL. */
export function KioskPage() {
  const { id } = useParams<{ id: string }>();
  const { data: events = [], isLoading } = useEvents();
  const event = events.find((e) => e._id === id);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-ink">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 bg-ink px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3.5">
          <Link
            to="/app"
            aria-label="Back to dashboard"
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-white/10 hover:text-white sm:ml-0"
          >
            <ArrowLeftIcon size={18} />
          </Link>
          <span className="truncate font-display text-[15px] font-bold tracking-[.02em] text-white">
            {event?.name ?? 'Event'}
          </span>
        </div>
        <PrinterStatus />
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-7 pt-5 sm:px-6">
        <div className="mx-auto max-w-[1120px]">
          {id && (event || isLoading) ? (
            <AttendeeTable key={id} eventId={id} eventName={event?.name} />
          ) : (
            <div className="rounded-2xl border border-line bg-white px-6 py-20 text-center">
              <div className="font-display text-[17px] font-bold text-ink-3">Event not found</div>
              <div className="mt-1.5 text-sm text-muted">
                It may have been removed.{' '}
                <Link to="/app" className="font-semibold text-brand-deep underline">
                  Back to dashboard
                </Link>
                .
              </div>
            </div>
          )}
        </div>
      </div>

      <BadgePreviewTray />
      <Toast />
    </div>
  );
}
