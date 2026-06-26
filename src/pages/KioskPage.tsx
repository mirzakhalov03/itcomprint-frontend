import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AttendeeTable } from '../components/AttendeeTable';
import { BadgePrintPanel } from '../components/BadgePrintPanel';
import { BadgePreviewTray } from '../components/BadgePreviewTray';
import { Toast } from '../components/Toast';
import { AppHeader } from '../components/AppHeader';
import { ArrowLeftIcon } from '../components/icons';
import { EmptyState, LoadingPanel } from '../components/ui/EmptyState';
import { useEvents } from '../hooks/useEvents';
import type { Attendee } from '../types';

/** Full-screen, single-event badge-printing view. Event comes from the URL. */
export function KioskPage() {
  const { id } = useParams<{ id: string }>();
  const { data: events = [], isLoading } = useEvents();
  const event = events.find((e) => e._id === id);
  const [previewAttendee, setPreviewAttendee] = useState<Attendee | null>(null);

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

      <div className="flex flex-1 overflow-hidden">
        {/* Left: scrollable table */}
        <div
          className={`overflow-y-auto px-4 pb-7 pt-5 sm:px-6 ${previewAttendee ? 'w-[65%]' : 'flex-1'}`}
        >
          <div className={previewAttendee ? '' : 'mx-auto max-w-[1120px]'}>
            {event ? (
              <AttendeeTable
                key={event._id}
                event={event}
                onPreview={setPreviewAttendee}
                previewId={previewAttendee?._id}
              />
            ) : isLoading ? (
              <LoadingPanel>Loading event…</LoadingPanel>
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

        {/* Right: badge preview + print panel */}
        {previewAttendee && event && (
          <div
            key={previewAttendee._id}
            className="flex w-[35%] flex-col overflow-hidden border-l border-line bg-white"
          >
            <BadgePrintPanel
              attendee={previewAttendee}
              event={event}
              onClose={() => setPreviewAttendee(null)}
            />
          </div>
        )}
      </div>

      <BadgePreviewTray />
      <Toast />
    </div>
  );
}
