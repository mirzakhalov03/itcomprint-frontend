import { useMutation, useQueryClient } from '@tanstack/react-query';
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

export function usePrintAttendee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ attendee, template, eventName }: PrintRequest) => {
      const adapter = usePrinterStore.getState().adapter;
      if (adapter.status !== 'connected') {
        throw new Error('Printer not connected. Click "Connect printer" first.');
      }
      const canvas = await renderBadgeToCanvas(attendee, template);
      const bitmap = canvasToMonochromeBitmap(canvas);
      const tspl = buildBadgeTSPL(bitmap, template.labelWidthMm, template.labelHeightMm);
      const previewDataUrl = adapter.kind === 'preview' ? canvas.toDataURL('image/png') : ''; // only the preview tray shows it
      await adapter.print({
        name: attendee.fullName,
        tspl,
        previewDataUrl,
        eventName,
        labelWidthMm: template.labelWidthMm,
        labelHeightMm: template.labelHeightMm,
      });
      return markPrinted(attendee);
    },
    onSuccess: (updated) => {
      // Patch the one row instead of refetching every cached roster.
      qc.setQueryData<Attendee[]>(['attendees', updated.eventId], (list) =>
        list?.map((a) => (a._id === updated._id ? updated : a)),
      );
      // Dashboard counts are now stale; refresh them on next view, not now.
      void qc.invalidateQueries({ queryKey: ['events'], exact: true, refetchType: 'none' });
      if (usePrinterStore.getState().adapter.kind === 'webusb') toast('Sent to printer');
    },
  });
}
