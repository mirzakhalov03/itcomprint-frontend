import { create } from 'zustand';
import type { PrintJob } from '../printer/PrinterAdapter';

interface PreviewState {
  jobs: PrintJob[];
  add: (job: PrintJob) => void;
  clear: () => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  jobs: [],
  add: (job) => set((s) => ({ jobs: [job, ...s.jobs] })),
  clear: () => set({ jobs: [] }),
}));
