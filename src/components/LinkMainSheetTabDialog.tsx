import { useState } from 'react';
import { useCreateEventFromSheet, useSheetTabs } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { ApiError } from '../lib/api';
import { todayLocal } from '../lib/format';
import { cn } from '../lib/cn';
import { Button } from './ui/Button';
import { inputBaseClass } from './ui/Input';
import { Dialog } from './ui/Dialog';
import { ChevronDownIcon } from './icons';
import { EventDetailsFields } from './EventDetailsFields';
import type { AppEvent, SheetTabStatus } from '../types';

const STATUS_SUFFIX: Record<SheetTabStatus, string> = {
  available: '',
  linked: ' (already added)',
  trashed: ' (in trash)',
};

export function LinkMainSheetTabDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (event: AppEvent) => void;
}) {
  const [eventName, setEventName] = useState('');
  const [autoName, setAutoName] = useState(''); // last title we filled in, to tell it from a typed name
  const [eventDate, setEventDate] = useState(todayLocal);
  const [tabGid, setTabGid] = useState<number | null>(null);
  const { data: tabs = [], isLoading, isError, error, refetch } = useSheetTabs();
  const createFromSheet = useCreateEventFromSheet();

  function handleTabChange(value: string) {
    const tab = tabs.find((t) => t.gid === Number(value));
    if (!tab) return;
    setTabGid(tab.gid);
    // Only overwrite a name the operator hasn't customized.
    if (!eventName.trim() || eventName === autoName) setEventName(tab.title);
    setAutoName(tab.title);
  }

  const canCreate = !!eventName.trim() && tabGid !== null && !!eventDate;

  async function handleCreate() {
    if (tabGid === null) return;
    try {
      const created = await createFromSheet.mutateAsync({
        name: eventName.trim(),
        date: eventDate,
        tabGid,
      });
      toast(`Event created — ${created.added} attendee(s) synced`);
      onCreated(created);
    } catch (err) {
      // Only a 409 means the tab got taken — the list just refetched with it disabled.
      if (err instanceof ApiError && err.status === 409) setTabGid(null);
      toast(errMessage(err, "Couldn't create the event — try again."));
    }
  }

  return (
    <Dialog
      size="lg"
      title="New event"
      description="Pick the event's tab from the Main Sheet — the roster syncs automatically."
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
            {createFromSheet.isPending ? 'Creating…' : 'Create event'}
          </Button>
        </>
      }
    >
      <label className="mt-3.5 flex flex-col gap-1.5">
        <span className="font-display text-xs font-semibold text-ink-3">Sheet tab</span>
        <div className="relative">
          <select
            className={cn(inputBaseClass, 'w-full appearance-none pr-9')}
            value={tabGid ?? ''}
            disabled={isLoading || isError}
            onChange={(e) => handleTabChange(e.target.value)}
          >
            <option value="" disabled>
              {isLoading ? 'Loading tabs…' : 'Select a tab'}
            </option>
            {tabs.map((tab) => (
              <option key={tab.gid} value={tab.gid} disabled={tab.status !== 'available'}>
                {tab.title}
                {STATUS_SUFFIX[tab.status]}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
          />
        </div>
        {isError && (
          <span className="text-xs text-danger">
            {errMessage(error, "Couldn't load the Main Sheet's tabs — try again.")}{' '}
            <button onClick={() => refetch()} className="font-semibold text-brand-deep underline">
              Retry
            </button>
          </span>
        )}
      </label>

      <EventDetailsFields
        name={eventName}
        date={eventDate}
        onNameChange={setEventName}
        onDateChange={setEventDate}
      />
    </Dialog>
  );
}
