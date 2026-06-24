import type { BadgeLine } from './buildBadgeTSPL';

export interface PrintJob {
  name: string; // attendee name — used for the download filename
  tspl: string; // raw bytes sent to the printer
  eventName?: string; // event label on the preview badge card
  lines: BadgeLine[]; // rendered zone lines for the on-screen preview
  labelWidthMm: number; // preview aspect ratio
  labelHeightMm: number;
}

export type PrinterStatus = 'disconnected' | 'connected';

export interface PrinterAdapter {
  readonly kind: 'preview' | 'webusb';
  status: PrinterStatus;
  connect(): Promise<void>;
  print(job: PrintJob): Promise<void>;
}
