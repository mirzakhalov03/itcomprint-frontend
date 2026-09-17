import { usePermanentDeleteEvent } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { ConfirmDialog } from './ui/ConfirmDialog';
import type { AppEvent } from '../types';

export function PermanentDeleteDialog({
  event,
  onClose,
}: {
  event: AppEvent;
  onClose: () => void;
}) {
  const permanentDelete = usePermanentDeleteEvent();

  return (
    <ConfirmDialog
      title="Delete forever?"
      description={`"${event.name}" and its ${event.attendeeCount ?? 0} attendee(s) will be permanently deleted. This cannot be undone.`}
      confirmLabel="Delete forever"
      pendingLabel="Deleting…"
      errorFallback="Couldn't delete that event — try again."
      onConfirm={async () => {
        await permanentDelete.mutateAsync(event._id);
        toast('Event permanently deleted');
      }}
      onClose={onClose}
    />
  );
}
