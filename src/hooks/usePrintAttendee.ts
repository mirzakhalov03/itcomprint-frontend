import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { buildBadgeTSPL } from '../printer/buildBadgeTSPL';
import { usePrinterStore } from '../store/printerStore';
import { toast } from '../store/toastStore';
import type { Attendee } from '../types';

export interface PrintRequest {
  attendee: Attendee;
  eventName?: string;
}

/** First subline of the attendee's extra fields (role/company) for the badge card. */
function firstExtra(attendee: Attendee): string | undefined {
  return Object.values(attendee.extra)[0];
}

export function usePrintAttendee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ attendee, eventName }: PrintRequest) => {
      const adapter = usePrinterStore.getState().adapter;
      if (adapter.status !== 'connected') {
        throw new Error('Printer not connected. Click "Connect printer" first.');
      }
      await adapter.print({
        name: attendee.fullName,
        tspl: buildBadgeTSPL(attendee.fullName),
        role: firstExtra(attendee),
        eventName,
      });
      return api.printAttendee(attendee._id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendees'] });
      // Preview mode is its own feedback (a card drops into the tray);
      // a real printer gets a confirmation toast.
      if (usePrinterStore.getState().adapter.kind === 'webusb') {
        toast('Sent to printer');
      }
    },
  });
}
