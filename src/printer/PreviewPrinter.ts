import type { PrinterAdapter, PrintJob, PrinterStatus } from './PrinterAdapter';

export class PreviewPrinter implements PrinterAdapter {
  readonly kind = 'preview' as const;
  status: PrinterStatus = 'connected';
  private readonly onPreview: (job: PrintJob) => void;

  constructor(onPreview: (job: PrintJob) => void) {
    this.onPreview = onPreview;
  }

  async connect(): Promise<void> {
    this.status = 'connected';
  }

  async print(job: PrintJob): Promise<void> {
    this.onPreview(job);
  }
}
