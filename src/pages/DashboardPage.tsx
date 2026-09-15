import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEvents } from '../hooks/useEvents';
import { EventCard } from '../components/EventCard';
import { UploadIcon, ChevronDownIcon } from '../components/icons';
import { Button } from '../components/ui/Button';
import { EmptyState, LoadingPanel } from '../components/ui/EmptyState';
import type { AppEvent } from '../types';

// Lazy so the ~500KB xlsx parser only loads when an operator opens Import.
const ImportDialog = lazy(() =>
  import('../components/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);
const LinkSheetDialog = lazy(() =>
  import('../components/LinkSheetDialog').then((m) => ({ default: m.LinkSheetDialog })),
);

type NewEventMode = 'closed' | 'upload' | 'sheet';

export function DashboardPage() {
  const { data: events = [], isLoading } = useEvents();
  const [mode, setMode] = useState<NewEventMode>('closed');
  const [chooserOpen, setChooserOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-ink">Events</h1>
        <div className="relative">
          <Button
            onClick={() => setChooserOpen((v) => !v)}
            className="h-11 gap-2 rounded-full px-[18px] text-sm"
          >
            <UploadIcon size={16} /> New event <ChevronDownIcon size={14} />
          </Button>
          {chooserOpen && (
            <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
              <button
                onClick={() => {
                  setChooserOpen(false);
                  setMode('upload');
                }}
                className="block w-full px-4 py-3 text-left text-sm text-ink hover:bg-surface"
              >
                Upload spreadsheet
              </button>
              <button
                onClick={() => {
                  setChooserOpen(false);
                  setMode('sheet');
                }}
                className="block w-full px-4 py-3 text-left text-sm text-ink hover:bg-surface"
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
