import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';

const POLL_INTERVAL_MS = 30000;

/**
 * Polls a sheet-linked event's roster while `enabled` (the Kiosk page is
 * open for that event). Background ticks are silent on failure — a flaky
 * Sheets API call self-heals on the next tick. Only the manual syncNow()
 * call (per-call onError, not the mutation's own) surfaces a toast, since
 * that's a deliberate action expecting feedback.
 */
export function useSheetSync(eventId: string | null, enabled: boolean) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.syncEventSheet(eventId!),
    onSuccess: (result) => {
      if (result.added > 0) qc.invalidateQueries({ queryKey: ['attendees', eventId] });
      qc.invalidateQueries({ queryKey: ['events'] }); // refresh lastSyncedAt display
    },
  });
  const mutateRef = useRef(mutation.mutate);
  const isPendingRef = useRef(mutation.isPending);
  useEffect(() => {
    mutateRef.current = mutation.mutate;
    isPendingRef.current = mutation.isPending;
  });

  useEffect(() => {
    if (!enabled || !eventId) return;
    const tick = () => {
      if (isPendingRef.current) return; // previous sync still in flight — skip this tick
      mutateRef.current(); // silent — no onError, background tick self-heals next round
    };
    tick(); // initial sync on mount
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, eventId]);

  return {
    syncNow: () =>
      mutation.mutate(undefined, {
        onError: (err) => toast(errMessage(err, "Couldn't sync the sheet — try again.")),
      }),
    isSyncing: mutation.isPending,
  };
}
