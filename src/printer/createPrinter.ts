import type { PrinterAdapter, PrintJob } from './PrinterAdapter';
import { PreviewPrinter } from './PreviewPrinter';
import { WebUsbPrinter } from './WebUsbPrinter';

export function createPrinter(onPreview: (job: PrintJob) => void): PrinterAdapter {
  const mode = import.meta.env.VITE_PRINTER_MODE ?? 'preview';
  return mode === 'webusb' ? new WebUsbPrinter() : new PreviewPrinter(onPreview);
}
