import { lazy, Suspense, useState } from 'react';
import { Header } from './components/Header';
import { EventBar } from './components/EventBar';
import { AttendeeTable } from './components/AttendeeTable';
import { BadgePreviewTray } from './components/BadgePreviewTray';
import { Toast } from './components/Toast';
import { useEvents } from './hooks/useEvents';

// Lazy so the ~500KB xlsx parser only loads when an operator opens Import.
const ImportDialog = lazy(() =>
  import('./components/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);

export default function App() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const { data: events = [] } = useEvents();

  // Default to the first event until the operator picks one (kiosk opens ready to work).
  const activeEventId = eventId ?? events[0]?._id ?? null;
  const selectedEvent = events.find((e) => e._id === activeEventId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-ink">
      <Header />
      <EventBar eventId={activeEventId} onChange={setEventId} onImport={() => setImporting(true)} />

      <div className="flex-1 overflow-y-auto px-6 pb-7 pt-5">
        <div className="mx-auto max-w-[1120px]">
          {activeEventId ? (
            <AttendeeTable
              key={activeEventId}
              eventId={activeEventId}
              eventName={selectedEvent?.name}
            />
          ) : (
            <div className="rounded-2xl border border-line bg-white px-6 py-20 text-center">
              <div className="font-display text-[17px] font-bold text-ink-3">No event selected</div>
              <div className="mt-1.5 text-sm text-muted">
                Import a spreadsheet to create your first event.
              </div>
            </div>
          )}
        </div>
      </div>

      <BadgePreviewTray />

      {importing && (
        <Suspense fallback={null}>
          <ImportDialog onClose={() => setImporting(false)} />
        </Suspense>
      )}
      <Toast />
    </div>
  );
}
