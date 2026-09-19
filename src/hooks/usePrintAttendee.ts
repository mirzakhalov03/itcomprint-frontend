import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { renderBadgeToCanvas, canvasToMonochromeBitmap } from '../printer/renderBadge';
import { buildBadgeTSPL } from '../printer/buildBadgeTSPL';
import { usePrinterStore } from '../store/printerStore';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import type { Attendee, BadgeTemplate } from '../types';

export interface PrintRequest {
  attendee: Attendee;
  template: BadgeTemplate;
  eventName?: string;
}

// The label already exists physically, so retry the status save once before reporting a mismatch.
async function markPrinted(attendee: Attendee): Promise<Attendee> {
  try {
    return await api.printAttendee(attendee._id);
  } catch {
    try {
      return await api.printAttendee(attendee._id);
    } catch (e) {
      throw new Error(
        `${attendee.fullName}'s badge printed, but saving that failed (${errMessage(e, 'network error')}) — it may still show "Not printed".`,
        { cause: e },
      );
    }
  }
}

async function patchAttendee(qc: QueryClient, updated: Attendee) {
  // Cancel any in-flight roster fetch (e.g. useSheetSync's poll) on this key first —
  // otherwise its stale response can land after our patch and revert the status.
  await qc.cancelQueries({ queryKey: ['attendees', updated.eventId] });
  // Patch the one row instead of refetching every cached roster.
  qc.setQueryData<Attendee[]>(['attendees', updated.eventId], (list) =>
    list?.map((a) => (a._id === updated._id ? updated : a)),
  );
  // Dashboard counts are now stale; refresh them on next view, not now.
  void qc.invalidateQueries({ queryKey: ['events'], exact: true, refetchType: 'none' });
}

export function usePrintAttendee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ attendee, template, eventName }: PrintRequest) => {
      const { adapter, double } = usePrinterStore.getState();
      const copies = double ? 2 : 1;
      if (adapter.status !== 'connected') {
        throw new Error('Printer not connected. Click "Connect printer" first.');
      }
      const canvas = await renderBadgeToCanvas(attendee, template);
      const bitmap = canvasToMonochromeBitmap(canvas);
      const tspl = buildBadgeTSPL(bitmap, template.labelWidthMm, template.labelHeightMm, copies);
      const previewDataUrl = adapter.kind === 'preview' ? canvas.toDataURL('image/png') : ''; // only the preview tray shows it
      await adapter.print({
        name: attendee.fullName,
        tspl,
        previewDataUrl,
        eventName,
        labelWidthMm: template.labelWidthMm,
        labelHeightMm: template.labelHeightMm,
        copies,
      });
      return markPrinted(attendee);
    },
    onSuccess: async (updated) => {
      await patchAttendee(qc, updated);
      if (usePrinterStore.getState().adapter.kind === 'webusb') toast('Sent to printer');
    },
  });
}

// Reverts a mistaken print so the attendee counts as "missed" again in the stats.
export function useUnprintAttendee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attendee: Attendee) => api.unprintAttendee(attendee._id),
    // No toast here: batch callers summarize once instead of one toast per attendee.
    onSuccess: (updated) => patchAttendee(qc, updated),
  });
}
