import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEvents } from '../hooks/useEvents';
import { EventCard } from '../components/EventCard';
import { UploadIcon } from '../components/icons';
import type { AppEvent } from '../types';

// Lazy so the ~500KB xlsx parser only loads when an operator opens Import.
const ImportDialog = lazy(() =>
  import('../components/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);

export function DashboardPage() {
  const { data: events = [], isLoading } = useEvents();
  const [importing, setImporting] = useState(false);
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-ink">Events</h1>
        <button
          onClick={() => setImporting(true)}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-[18px] font-display text-sm font-bold text-white transition-colors hover:bg-brand-strong"
        >
          <UploadIcon size={16} /> New event
        </button>
      </div>

      {isLoading ? (
        <div className="px-6 py-16 text-center text-sm text-muted">Loading events…</div>
      ) : events.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e._id} event={e} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-white px-6 py-20 text-center">
          <div className="font-display text-[17px] font-bold text-ink-3">No events yet</div>
          <div className="mt-1.5 text-sm text-muted">
            Import a spreadsheet to create your first event.
          </div>
        </div>
      )}

      {importing && (
        <Suspense fallback={null}>
          <ImportDialog
            onClose={() => setImporting(false)}
            onImported={(event: AppEvent) => {
              setImporting(false);
              navigate(`/app/events/${event._id}`);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
