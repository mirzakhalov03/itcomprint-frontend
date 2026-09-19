import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AttendeeTable } from '../components/AttendeeTable';
import { BadgePrintPanel } from '../components/BadgePrintPanel';
import { BadgePreviewTray } from '../components/BadgePreviewTray';
import { ScrollJumpButton } from '../components/ScrollJumpButton';
import { AppHeader } from '../components/AppHeader';
import { ArrowLeftIcon } from '../components/icons';
import { EmptyState, LoadingPanel } from '../components/ui/EmptyState';
import { Sheet } from '../components/ui/Sheet';
import { useEvents } from '../hooks/useEvents';
import { useAttendees } from '../hooks/useAttendees';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useEscapeKey } from '../hooks/useEscapeKey';
import type { Attendee } from '../types';

/** Full-screen, single-event badge-printing view. Event comes from the URL. */
export function KioskPage() {
  const { id } = useParams<{ id: string }>();
  const { data: events = [], isLoading } = useEvents();
  const event = events.find((e) => e._id === id);
  const { data: attendees } = useAttendees(event ? event._id : null);
  // Store the id, not a snapshot, so the open panel reflects prints and sync updates live
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewAttendee = attendees?.find((a) => a._id === previewId) ?? null;
  const isDesktop = useIsDesktop();
  const splitView = !!previewAttendee && isDesktop;
  const listRef = useRef<HTMLDivElement>(null);

  // Keyboard loop: search → Enter opens → Enter prints → back to search, text selected for the next ID.
  const searchRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLButtonElement>(null);
  const focusSearch = useCallback(() => {
    // Desktop only: on touch, focusing the input would pop the keyboard over the sheet.
    if (!isDesktop) return;
    searchRef.current?.focus();
    searchRef.current?.select();
  }, [isDesktop]);

  // Ref mirror keeps openPanel stable for the memoized rows.
  const previewIdRef = useRef(previewId);
  useEffect(() => {
    previewIdRef.current = previewId;
  }, [previewId]);
  const openPanel = useCallback((a: Attendee) => {
    // Same attendee: no remount, so autoFocus won't fire again. A new one's panel autoFocuses.
    if (a._id === previewIdRef.current) printRef.current?.focus();
    setPreviewId(a._id);
  }, []);
  const closePanel = useCallback(() => {
    setPreviewId(null);
    focusSearch();
  }, [focusSearch]);
  // A dialog on top owns Escape. The handheld Sheet handles its own.
  const escapePanel = useCallback(() => {
    if (!document.querySelector('[aria-modal="true"]')) closePanel();
  }, [closePanel]);
  useEscapeKey(escapePanel, splitView);

  const panel = previewAttendee && event && (
    <BadgePrintPanel
      key={previewAttendee._id}
      attendee={previewAttendee}
      event={event}
      onClose={closePanel}
      onPrinted={focusSearch}
      printRef={printRef}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface text-ink">
      <AppHeader
        title={event?.name ?? 'Event'}
        eventId={event?._id}
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
        {/* Left: scrollable table. Wrapper is `relative` so the jump button floats over, not with, the list. */}
        <div className={`relative min-w-0 ${splitView ? 'w-[65%]' : 'flex-1'}`}>
          <div ref={listRef} className="h-full overflow-y-auto px-3 pb-7 pt-3 sm:px-6 sm:pt-5">
            <div className={splitView ? '' : 'mx-auto max-w-[1120px]'}>
              {event ? (
                <AttendeeTable
                  key={event._id}
                  event={event}
                  onPreview={openPanel}
                  previewId={previewAttendee?._id}
                  searchRef={searchRef}
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
          <ScrollJumpButton targetRef={listRef} />
        </div>

        {/* Right: badge preview + print panel. Handheld screens get it as a bottom sheet. */}
        {previewAttendee &&
          panel &&
          (isDesktop ? (
            <div className="flex w-[35%] flex-col overflow-hidden border-l border-line bg-white">
              {panel}
            </div>
          ) : (
            <Sheet label={`Print badge for ${previewAttendee.fullName}`} onClose={closePanel}>
              {panel}
            </Sheet>
          ))}
      </div>

      <BadgePreviewTray />
    </div>
  );
}
