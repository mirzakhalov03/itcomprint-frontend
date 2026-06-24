import { Link, useParams } from 'react-router-dom';
import { AttendeeTable } from '../components/AttendeeTable';
import { BadgePreviewTray } from '../components/BadgePreviewTray';
import { Toast } from '../components/Toast';
import { AppHeader } from '../components/AppHeader';
import { ArrowLeftIcon } from '../components/icons';
import { EmptyState } from '../components/ui/EmptyState';
import { useEvents } from '../hooks/useEvents';

/** Full-screen, single-event badge-printing view. Event comes from the URL. */
export function KioskPage() {
  const { id } = useParams<{ id: string }>();
  const { data: events = [], isLoading } = useEvents();
  const event = events.find((e) => e._id === id);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-ink">
      <AppHeader
        title={event?.name ?? 'Event'}
        leftSlot={
          <Link
            to="/app"
            aria-label="Back to dashboard"
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-white/10 hover:text-white sm:ml-0"
          >
            <ArrowLeftIcon size={18} />
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 pb-7 pt-5 sm:px-6">
        <div className="mx-auto max-w-[1120px]">
          {id && (event || isLoading) ? (
            <AttendeeTable key={id} eventId={id} eventName={event?.name} />
          ) : (
            <EmptyState
              title="Event not found"
              subtitle={
                <>
                  It may have been removed.{' '}
                  <Link to="/app" className="font-semibold text-brand-deep underline">
                    Back to dashboard
                  </Link>
                  .
                </>
              }
            />
          )}
        </div>
      </div>

      <BadgePreviewTray />
      <Toast />
    </div>
  );
}
