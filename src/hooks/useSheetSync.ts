import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { attendeesQueryOptions } from './useAttendees';
import { eventsQueryOptions } from './useEvents';
import type { AppEvent } from '../types';

const SHEET_PULL_MS = 30_000;
const ROSTER_POLL_MS = 10_000; // other stations' prints
const EVENTS_POLL_MS = 30_000; // other stations' renames / template switches

/**
 * Keeps a sheet-linked kiosk live: pulls the Google Sheet into the roster and polls
 * the shared roster/event caches so every station sees each other's prints and edits.
 * Background ticks are silent on failure; only syncNow() toasts, since it's deliberate.
 */
export function useSheetSync(eventId: string | null, enabled: boolean) {
  const qc = useQueryClient();
  const live = enabled && !!eventId;

  // Extra observers on the shared keys — React Query polls at the fastest mounted interval.
  useQuery({
    ...attendeesQueryOptions(eventId ?? ''),
    enabled: live,
    refetchInterval: ROSTER_POLL_MS,
    refetchOnWindowFocus: true,
  });
  useQuery({
    ...eventsQueryOptions,
    enabled: live,
    refetchInterval: EVENTS_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const mutation = useMutation({
    mutationFn: () => api.syncEventSheet(eventId!),
    onSuccess: (result) => {
      if (result.added > 0 || result.updated > 0) {
        void qc.invalidateQueries({ queryKey: ['attendees', eventId] });
      }
      // Patch the timestamp in place instead of refetching the whole events list.
      qc.setQueryData<AppEvent[]>(['events'], (events) =>
        events?.map((e) => (e._id === eventId ? { ...e, lastSyncedAt: result.lastSyncedAt } : e)),
      );
    },
  });
  const mutateRef = useRef(mutation.mutate);
  const isPendingRef = useRef(mutation.isPending);
  useEffect(() => {
    mutateRef.current = mutation.mutate;
    isPendingRef.current = mutation.isPending;
  });

  useEffect(() => {
    if (!live) return;
    const tick = () => {
      if (document.hidden || isPendingRef.current) return; // hidden tab, or previous pull in flight
      mutateRef.current();
    };
    tick();
    const id = setInterval(tick, SHEET_PULL_MS);
    return () => clearInterval(id);
  }, [live]);

  return {
    syncNow: () =>
      mutation.mutate(undefined, {
        onError: (err) => toast(errMessage(err, "Couldn't sync the sheet — try again.")),
      }),
    isSyncing: mutation.isPending,
  };
}
