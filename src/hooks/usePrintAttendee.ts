import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { renderBadgeToCanvas, canvasToMonochromeBitmap } from '../printer/renderBadge';
import { buildBadgeTSPL } from '../printer/buildBadgeTSPL';
import { usePrinterStore } from '../store/printerStore';
import { toast } from '../store/toastStore';
import type { Attendee, BadgeTemplate } from '../types';

export interface PrintRequest {
  attendee: Attendee;
  template: BadgeTemplate;
  eventName?: string;
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
      const previewDataUrl = canvas.toDataURL('image/png');
      await adapter.print({
        name: attendee.fullName,
        tspl,
        previewDataUrl,
        eventName,
        labelWidthMm: template.labelWidthMm,
        labelHeightMm: template.labelHeightMm,
      });
      return api.printAttendee(attendee._id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendees'] });
      if (usePrinterStore.getState().adapter.kind === 'webusb') {
        toast('Sent to printer');
      }
    },
  });
}
