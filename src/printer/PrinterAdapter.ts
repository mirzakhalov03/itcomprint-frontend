export interface PrintJob {
  name: string; // for the on-screen preview
  tspl: string; // raw bytes sent to the printer
  role?: string; // secondary line on the preview badge card
  eventName?: string; // event label on the preview badge card
}

export type PrinterStatus = 'disconnected' | 'connected';

export interface PrinterAdapter {
  readonly kind: 'preview' | 'webusb';
  status: PrinterStatus;
  connect(): Promise<void>;
  print(job: PrintJob): Promise<void>;
}
