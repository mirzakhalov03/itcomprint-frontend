import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEvents } from '../hooks/useEvents';
import { EventCard } from '../components/EventCard';
import { UploadIcon } from '../components/icons';
import { Button } from '../components/ui/Button';
import { EmptyState, LoadingPanel } from '../components/ui/EmptyState';
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
        <Button
          onClick={() => setImporting(true)}
          className="h-11 gap-2 rounded-full px-[18px] text-sm"
        >
          <UploadIcon size={16} /> New event
        </Button>
      </div>

      {isLoading ? (
        <LoadingPanel>Loading events…</LoadingPanel>
      ) : events.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e._id} event={e} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No events yet"
          subtitle="Import a spreadsheet to create your first event."
        />
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
