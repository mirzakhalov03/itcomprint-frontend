import { useTrashEvent } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { TRASH_RETENTION_DAYS } from '../lib/format';
import { ConfirmDialog } from './ui/ConfirmDialog';
import type { AppEvent } from '../types';

export function MoveToTrashDialog({ event, onClose }: { event: AppEvent; onClose: () => void }) {
  const trashEvent = useTrashEvent();

  return (
    <ConfirmDialog
      title="Move to trash?"
      description={`"${event.name}" and its ${event.attendeeCount ?? 0} attendee(s) will move to Trash and stay there for ${TRASH_RETENTION_DAYS} days before being permanently deleted. You can restore it any time before then.`}
      confirmLabel="Move to trash"
      pendingLabel="Moving…"
      errorFallback="Couldn't move that event to trash — try again."
      onConfirm={async () => {
        await trashEvent.mutateAsync(event._id);
        toast('Event moved to trash');
      }}
      onClose={onClose}
    />
  );
}
