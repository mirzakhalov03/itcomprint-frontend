import { create } from 'zustand';
import type { PrinterAdapter, PrinterStatus } from '../printer/PrinterAdapter';
import { createPrinter } from '../printer/createPrinter';
import { errMessage } from '../lib/errors';
import { usePreviewStore } from './previewStore';
import { toast } from './toastStore';
import { api } from '../lib/api';

interface PrinterState {
  adapter: PrinterAdapter;
  status: PrinterStatus;
  error: string | null;
  /** Print two copies of each badge. Session-only: every kiosk load starts checked. */
  double: boolean;
  setDouble: (double: boolean) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const adapter = createPrinter((job) => usePreviewStore.getState().add(job));

export const usePrinterStore = create<PrinterState>((set) => ({
  adapter,
  status: adapter.status,
  error: null,
  double: true,
  setDouble: (double) => set({ double }),
  connect: async () => {
    try {
      await adapter.connect();
      set({ status: adapter.status, error: null });
    } catch (e) {
      set({ error: errMessage(e, 'Failed to connect') });
    }
  },
  disconnect: async () => {
    await adapter.disconnect();
    set({ status: adapter.status, error: null });
  },
}));

/** Connect the printer and surface the outcome as a toast. Shared by the
 *  header status pill and the Printer page so the connect-and-notify flow
 *  lives in one place. */
export async function connectPrinterWithToast(eventId?: string) {
  await usePrinterStore.getState().connect();
  const s = usePrinterStore.getState();
  if (s.status === 'connected') {
    toast('Printer connected');
    reportPrinter('connect', eventId);
  } else if (s.error) toast(s.error);
}

export async function disconnectPrinterWithToast(eventId?: string) {
  await usePrinterStore.getState().disconnect();
  toast('Printer disconnected');
  reportPrinter('disconnect', eventId);
}

// WebUSB state lives only in this browser, so it's reported for the activity log.
// Best-effort: a failed log must not undo or block the connect.
function reportPrinter(action: 'connect' | 'disconnect', eventId?: string) {
  api.logPrinterActivity(action, eventId ?? null).catch(() => {});
}
