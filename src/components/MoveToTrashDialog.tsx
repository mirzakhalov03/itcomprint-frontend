import { useTrashEvent } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { Button } from './ui/Button';
import type { AppEvent } from '../types';

export function MoveToTrashDialog({ event, onClose }: { event: AppEvent; onClose: () => void }) {
  const trashEvent = useTrashEvent();

  async function handleConfirm() {
    try {
      await trashEvent.mutateAsync(event._id);
      toast('Event moved to trash');
      onClose();
    } catch (err) {
      toast(errMessage(err, "Couldn't move that event to trash — try again."));
    }
  }

  return (
    <div
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/55 p-4 backdrop-blur-[4px] sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-dlg-in my-auto w-full max-w-[420px] rounded-2xl bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,.3)] sm:p-7"
      >
        <div className="font-display text-xl font-bold text-ink">Move to trash?</div>
        <div className="mt-1.5 text-sm text-muted">
          "{event.name}" and its {event.attendeeCount ?? 0} attendee(s) will move to Trash and stay
          there for 45 days before being permanently deleted. You can restore it any time before
          then.
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <Button
            variant="secondary"
            onClick={onClose}
            className="h-11 rounded-[10px] px-5 text-sm"
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={trashEvent.isPending}
            className="h-11 rounded-[10px] px-6 text-sm"
          >
            {trashEvent.isPending ? 'Moving…' : 'Move to trash'}
          </Button>
        </div>
      </div>
    </div>
  );
}
