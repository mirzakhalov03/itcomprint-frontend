import { useState } from 'react';
import { useCreateEventFromSheet } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import type { AppEvent } from '../types';

export function LinkSheetDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: (event: AppEvent) => void;
}) {
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
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
    <div
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/55 p-4 backdrop-blur-[4px] sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-dlg-in my-auto w-full max-w-[520px] rounded-2xl bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,.3)] sm:p-7"
      >
        <div className="font-display text-xl font-bold text-ink">Link a Google Sheet</div>
        <div className="mt-1 text-sm text-muted">
          The roster syncs automatically from this sheet — new registrants appear on the kiosk
          within seconds.
        </div>

        <div className="mt-[18px] grid grid-cols-2 gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-xs font-semibold text-ink-3">Event name</span>
            <Input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g. DevFest Tashkent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-xs font-semibold text-ink-3">Event date</span>
            <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </label>
        </div>

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

        <div className="mt-6 flex justify-end gap-2.5">
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
        </div>
      </div>
    </div>
  );
}
