import { create } from 'zustand';
import type { PrinterAdapter, PrinterStatus } from '../printer/PrinterAdapter';
import { createPrinter } from '../printer/createPrinter';
import { usePreviewStore } from './previewStore';
import { toast } from './toastStore';

interface PrinterState {
  adapter: PrinterAdapter;
  status: PrinterStatus;
  error: string | null;
  connect: () => Promise<void>;
}

const adapter = createPrinter((job) => usePreviewStore.getState().add(job));

export const usePrinterStore = create<PrinterState>((set) => ({
  adapter,
  status: adapter.status,
  error: null,
  connect: async () => {
    try {
      await adapter.connect();
      set({ status: adapter.status, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to connect' });
    }
  },
}));

/** Connect the printer and surface the outcome as a toast. Shared by the
 *  header status pill and the Printer page so the connect-and-notify flow
 *  lives in one place. */
export async function connectPrinterWithToast() {
  await usePrinterStore.getState().connect();
  const s = usePrinterStore.getState();
  if (s.status === 'connected') toast('Printer connected');
  else if (s.error) toast(s.error);
}
