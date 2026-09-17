import { useState } from 'react';
import { useTrash, useRestoreEvent } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { fmtDate, daysUntil, TRASH_RETENTION_DAYS } from '../lib/format';
import { PermanentDeleteDialog } from '../components/PermanentDeleteDialog';
import { CalendarIcon, UsersIcon, RotateCcwIcon, TrashIcon } from '../components/icons';
import { Button } from '../components/ui/Button';
import { EmptyState, LoadingPanel } from '../components/ui/EmptyState';
import type { AppEvent } from '../types';

function TrashRow({ event, onDelete }: { event: AppEvent; onDelete: () => void }) {
  const restoreEvent = useRestoreEvent();
  const remaining = event.purgeAt ? daysUntil(event.purgeAt) : 0;

  async function handleRestore() {
    try {
      await restoreEvent.mutateAsync(event._id);
      toast('Event restored');
    } catch (err) {
      toast(errMessage(err, "Couldn't restore that event — try again."));
    }
  }

  return (
    <div className="flex flex-col gap-3 border-b border-line-3 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-display text-[15px] font-bold text-ink">{event.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarIcon size={13} className="text-faint" /> {fmtDate(event.date)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UsersIcon size={13} className="text-faint" /> {event.attendeeCount ?? 0}
          </span>
          <span className="font-semibold text-amber-ink">
            {remaining > 0 ? `${remaining} day(s) left` : 'Purging soon'}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button
          variant="secondary"
          onClick={handleRestore}
          disabled={restoreEvent.isPending}
          className="h-9 gap-1.5 rounded-lg px-3.5 text-xs"
        >
          <RotateCcwIcon size={13} /> Restore
        </Button>
        <Button
          variant="danger"
          onClick={onDelete}
          className="h-9 gap-1.5 rounded-lg px-3.5 text-xs"
        >
          <TrashIcon size={13} /> Delete forever
        </Button>
      </div>
    </div>
  );
}

export function TrashPage() {
  const { data: events = [], isLoading } = useTrash();
  const [deleteTarget, setDeleteTarget] = useState<AppEvent | null>(null);

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-xl font-bold text-ink">Trash</h1>
        <p className="mt-1 text-sm text-muted">
          Deleted events stay here for {TRASH_RETENTION_DAYS} days before they're permanently
          removed.
        </p>
      </div>

      {isLoading ? (
        <LoadingPanel>Loading trash…</LoadingPanel>
      ) : events.length > 0 ? (
        <div className="rounded-2xl border border-line bg-white px-5">
          {events.map((e) => (
            <TrashRow key={e._id} event={e} onDelete={() => setDeleteTarget(e)} />
          ))}
        </div>
      ) : (
        <EmptyState title="Trash is empty" subtitle="Deleted events will show up here." />
      )}

      {deleteTarget && (
        <PermanentDeleteDialog event={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
