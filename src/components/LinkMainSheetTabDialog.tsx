import { useId, useState } from 'react';
import { useCreateEventFromSheet, useRefreshSheetTabs, useSheetTabs } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { ApiError } from '../lib/api';
import { todayLocal } from '../lib/format';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { SheetTabPicker } from './SheetTabPicker';
import { EventDetailsFields } from './EventDetailsFields';
import type { AppEvent, SheetTab } from '../types';

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
  const refreshTabs = useRefreshSheetTabs();
  const createFromSheet = useCreateEventFromSheet();
  const tabLabelId = useId();

  function handleTabChange(tab: SheetTab) {
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
      <div className="mt-3.5 flex flex-col gap-1.5">
        <span id={tabLabelId} className="font-display text-xs font-semibold text-ink-3">
          Sheet tab
        </span>
        <SheetTabPicker
          tabs={tabs}
          value={tabGid}
          onChange={handleTabChange}
          loading={isLoading}
          disabled={isError && tabs.length === 0}
          refreshing={refreshTabs.isPending}
          onRefresh={() =>
            refreshTabs.mutate(undefined, {
              onError: (err) => toast(errMessage(err, "Couldn't refresh the tabs — try again.")),
            })
          }
          labelId={tabLabelId}
        />
        {isError && tabs.length === 0 && (
          <span className="text-xs text-danger">
            {errMessage(error, "Couldn't load the Main Sheet's tabs — try again.")}{' '}
            <button onClick={() => refetch()} className="font-semibold text-brand-deep underline">
              Retry
            </button>
          </span>
        )}
      </div>

      <EventDetailsFields
        name={eventName}
        date={eventDate}
        onNameChange={setEventName}
        onDateChange={setEventDate}
      />
    </Dialog>
  );
}
