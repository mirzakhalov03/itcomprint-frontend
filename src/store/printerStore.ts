import { create } from 'zustand';
import type { PrinterAdapter, PrinterStatus } from '../printer/PrinterAdapter';
import { createPrinter } from '../printer/createPrinter';
import { usePreviewStore } from './previewStore';

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
