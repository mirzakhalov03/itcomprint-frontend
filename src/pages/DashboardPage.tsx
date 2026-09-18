import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEvents } from '../hooks/useEvents';
import { useClickOutside } from '../hooks/useClickOutside';
import { EventCard } from '../components/EventCard';
import { UploadIcon, ChevronDownIcon } from '../components/icons';
import { Button } from '../components/ui/Button';
import { EmptyState, LoadingPanel } from '../components/ui/EmptyState';
import { todayLocal } from '../lib/format';
import type { AppEvent } from '../types';

// Lazy so the ~500KB xlsx parser only loads when an operator opens Import.
const ImportDialog = lazy(() =>
  import('../components/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);
const LinkSheetDialog = lazy(() =>
  import('../components/LinkSheetDialog').then((m) => ({ default: m.LinkSheetDialog })),
);

type NewEventMode = 'closed' | 'upload' | 'sheet';

// Calendar day as picked (date-only input is stored as UTC midnight).
const dayOf = (e: AppEvent) => e.date.slice(0, 10);

/** Upcoming (today included) soonest-first; past most-recent-first. */
function splitByDate(events: AppEvent[]) {
  const today = todayLocal();
  const upcoming: AppEvent[] = [];
  const past: AppEvent[] = [];
  for (const e of events) (dayOf(e) >= today ? upcoming : past).push(e);
  upcoming.sort((a, b) => dayOf(a).localeCompare(dayOf(b)));
  past.sort((a, b) => dayOf(b).localeCompare(dayOf(a)));
  return { upcoming, past };
}

/** Muted "Title ———" header, then cards or a quiet empty line. */
function EventSection({
  title,
  events,
  emptyText,
}: {
  title: string;
  events: AppEvent[];
  emptyText: string;
}) {
  return (
    <section className="mb-8 last:mb-0">
      <div className="mb-4 flex items-center gap-3 text-faint">
        <h2 className="font-display text-sm font-semibold">{title}</h2>
        <span className="h-px flex-1 bg-line" />
      </div>
      {events.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e._id} event={e} />
          ))}
        </div>
      ) : (
        <p className="py-2 text-sm text-faint">{emptyText}</p>
      )}
    </section>
  );
}

export function DashboardPage() {
  const { data: events = [], isLoading } = useEvents();
  const [mode, setMode] = useState<NewEventMode>('closed');
  const [chooserOpen, setChooserOpen] = useState(false);
  const chooserRef = useRef<HTMLDivElement>(null);
  useClickOutside(chooserRef, chooserOpen, () => setChooserOpen(false));
  const navigate = useNavigate();
  const { upcoming, past } = useMemo(() => splitByDate(events), [events]);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-ink">Events</h1>
        <div ref={chooserRef} className="relative">
          <Button
            onClick={() => setChooserOpen((v) => !v)}
            className="h-11 gap-2 rounded-full px-[18px] text-sm"
          >
            <UploadIcon size={16} /> New event <ChevronDownIcon size={14} />
          </Button>
          {chooserOpen && (
            <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-brand-line bg-brand-tint shadow-lg">
              <button
                onClick={() => {
                  setChooserOpen(false);
                  setMode('upload');
                }}
                className="block w-full px-4 py-3 text-left text-sm text-ink hover:bg-white/60"
              >
                Upload spreadsheet
              </button>
              <button
                onClick={() => {
                  setChooserOpen(false);
                  setMode('sheet');
                }}
                className="block w-full px-4 py-3 text-left text-sm text-ink hover:bg-white/60"
              >
                Link Google Sheet
              </button>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <LoadingPanel>Loading events…</LoadingPanel>
      ) : events.length > 0 ? (
        <>
          <EventSection title="Upcoming events" events={upcoming} emptyText="No upcoming events." />
          <EventSection title="Past events" events={past} emptyText="No past events yet." />
        </>
      ) : (
        <EmptyState
          title="No events yet"
          subtitle="Import a spreadsheet to create your first event."
        />
      )}

      {mode === 'upload' && (
        <Suspense fallback={null}>
          <ImportDialog
            onClose={() => setMode('closed')}
            onImported={(event: AppEvent) => {
              setMode('closed');
              navigate(`/app/events/${event._id}`);
            }}
          />
        </Suspense>
      )}
      {mode === 'sheet' && (
        <Suspense fallback={null}>
          <LinkSheetDialog
            onClose={() => setMode('closed')}
            onImported={(event: AppEvent) => {
              setMode('closed');
              navigate(`/app/events/${event._id}`);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
