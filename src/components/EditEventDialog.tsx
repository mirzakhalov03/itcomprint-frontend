import { useState } from 'react';
import { useUpdateEvent } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import type { AppEvent } from '../types';

export function EditEventDialog({ event, onClose }: { event: AppEvent; onClose: () => void }) {
  const [name, setName] = useState(event.name);
  const [date, setDate] = useState(event.date.slice(0, 10));
  const updateEvent = useUpdateEvent();

  const canSave = !!name.trim() && !!date;

  async function handleSave() {
    try {
      await updateEvent.mutateAsync({ eventId: event._id, name: name.trim(), date });
      toast('Event updated');
      onClose();
    } catch (err) {
      toast(errMessage(err, "Couldn't update that event — try again."));
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
        <div className="font-display text-xl font-bold text-ink">Edit event</div>

        <label className="mt-[18px] flex flex-col gap-1.5">
          <span className="font-display text-xs font-semibold text-ink-3">Event name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="mt-3.5 flex flex-col gap-1.5">
          <span className="font-display text-xs font-semibold text-ink-3">Event date</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div className="mt-6 flex justify-end gap-2.5">
          <Button
            variant="secondary"
            onClick={onClose}
            className="h-11 rounded-[10px] px-5 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || updateEvent.isPending}
            className="h-11 rounded-[10px] px-6 text-sm"
          >
            {updateEvent.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
