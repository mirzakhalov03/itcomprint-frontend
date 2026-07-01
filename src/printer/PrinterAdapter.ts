export interface PrintJob {
  name: string;
  tspl: Uint8Array<ArrayBuffer>; // raw bytes: TSPL header + bitmap data
  previewDataUrl: string; // canvas.toDataURL('image/png') for on-screen preview
  eventName?: string;
  labelWidthMm: number;
  labelHeightMm: number;
}

export type PrinterStatus = 'disconnected' | 'connected';

export interface PrinterAdapter {
  readonly kind: 'preview' | 'webusb';
  status: PrinterStatus;
  connect(): Promise<void>;
  print(job: PrintJob): Promise<void>;
}
