import { useState } from 'react';
import { useUpdateEvent } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { EventDetailsFields } from './EventDetailsFields';
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
    <Dialog
      title="Edit event"
      busy={updateEvent.isPending}
      onClose={onClose}
      footer={
        <>
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
        </>
      }
    >
      <EventDetailsFields name={name} date={date} onNameChange={setName} onDateChange={setDate} />
    </Dialog>
  );
}
