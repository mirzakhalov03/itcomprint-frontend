import { useState } from 'react';
import { useUpdateEvent } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { busRoutesError } from '../lib/busRoutes';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { EventDetailsFields } from './EventDetailsFields';
import { BusRoutesEditor } from './BusRoutesEditor';
import type { AppEvent } from '../types';

export function EditEventDialog({ event, onClose }: { event: AppEvent; onClose: () => void }) {
  const [name, setName] = useState(event.name);
  const [date, setDate] = useState(event.date.slice(0, 10));
  const [initialRoutes] = useState(() => event.busRoutes ?? []);
  const [routes, setRoutes] = useState(initialRoutes);
  const updateEvent = useUpdateEvent();

  const routesError = busRoutesError(routes);
  // Only send routes when edited, so an untouched dialog can't drop a phrase sync just added.
  const routesChanged = JSON.stringify(routes) !== JSON.stringify(initialRoutes);
  const canSave = !!name.trim() && !!date && !routesError;

  async function handleSave() {
    try {
      await updateEvent.mutateAsync({
        eventId: event._id,
        name: name.trim(),
        date,
        ...(routesChanged && {
          busRoutes: routes.map((r) => ({ ...r, label: r.label.trim() })),
        }),
      });
      toast('Event updated');
      onClose();
    } catch (err) {
      toast(errMessage(err, "Couldn't update that event — try again."));
    }
  }

  return (
    <Dialog
      title="Edit event"
      size={initialRoutes.length > 0 ? 'lg' : 'md'}
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
      {initialRoutes.length > 0 && <BusRoutesEditor routes={routes} onChange={setRoutes} />}
      {routesError && <p className="mt-2 text-xs text-danger">{routesError}</p>}
    </Dialog>
  );
}
