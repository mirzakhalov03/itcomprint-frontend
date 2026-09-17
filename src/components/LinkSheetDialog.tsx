import { useState } from 'react';
import { useCreateEventFromSheet } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { todayLocal } from '../lib/format';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Dialog } from './ui/Dialog';
import { EventDetailsFields } from './EventDetailsFields';
import type { AppEvent } from '../types';

export function LinkSheetDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: (event: AppEvent) => void;
}) {
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(todayLocal);
  const [sheetUrl, setSheetUrl] = useState('');
  const createFromSheet = useCreateEventFromSheet();

  const canCreate = !!eventName.trim() && !!sheetUrl.trim();

  async function handleCreate() {
    try {
      const created = await createFromSheet.mutateAsync({
        name: eventName.trim(),
        date: eventDate,
        sheetUrl: sheetUrl.trim(),
      });
      toast(`Event linked — ${created.added} attendee(s) synced`);
      if (onImported) onImported(created);
      else onClose();
    } catch (err) {
      toast(errMessage(err, "Couldn't link that sheet — try again."));
    }
  }

  return (
    <Dialog
      size="lg"
      title="Link a Google Sheet"
      description="The roster syncs automatically from this sheet — new registrants appear on the kiosk within seconds."
      busy={createFromSheet.isPending}
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
            onClick={handleCreate}
            disabled={!canCreate || createFromSheet.isPending}
            className="h-11 rounded-[10px] px-6 text-sm"
          >
            {createFromSheet.isPending ? 'Linking…' : 'Link sheet'}
          </Button>
        </>
      }
    >
      <EventDetailsFields
        name={eventName}
        date={eventDate}
        onNameChange={setEventName}
        onDateChange={setEventDate}
      />

      <label className="mt-3.5 flex flex-col gap-1.5">
        <span className="font-display text-xs font-semibold text-ink-3">Google Sheet link</span>
        <Input
          value={sheetUrl}
          onChange={(e) => setSheetUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
        />
      </label>

      <div className="mt-2.5 text-xs text-faint">
        Make sure this sheet is shared (Viewer) with the sync service account first.
      </div>
    </Dialog>
  );
}
