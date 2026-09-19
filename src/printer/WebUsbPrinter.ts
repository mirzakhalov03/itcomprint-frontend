import type { PrinterAdapter, PrintJob, PrinterStatus } from './PrinterAdapter';

export class WebUsbPrinter implements PrinterAdapter {
  readonly kind = 'webusb' as const;
  status: PrinterStatus = 'disconnected';
  private device: USBDevice | null = null;
  private endpointNumber = 1;

  async connect(): Promise<void> {
    if (!('usb' in navigator)) {
      throw new Error('WebUSB is not supported in this browser. Use Chrome or Edge.');
    }
    const device = await navigator.usb.requestDevice({ filters: [] });
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);

    const iface = device.configuration!.interfaces.find((i) =>
      i.alternate.endpoints.some((e) => e.direction === 'out' && e.type === 'bulk'),
    );
    if (!iface) throw new Error('No bulk OUT endpoint found on this device.');

    await device.claimInterface(iface.interfaceNumber);
    const ep = iface.alternate.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')!;
    this.endpointNumber = ep.endpointNumber;
    this.device = device;
    this.status = 'connected';
  }

  // forget() revokes the pairing so the next connect() starts fresh, as on first use.
  // Errors are swallowed: a cable-pulled or wedged device can't be closed cleanly, and
  // the point of disconnecting is to get back to a known-clean state anyway.
  async disconnect(): Promise<void> {
    const device = this.device;
    this.device = null;
    this.status = 'disconnected';
    if (!device) return;
    try {
      if (typeof device.forget === 'function')
        await device.forget(); // Chrome 101+
      else await device.close();
    } catch {
      // already gone
    }
  }

  async print(job: PrintJob): Promise<void> {
    if (!this.device) throw new Error('Printer not connected.');
    await this.device.transferOut(this.endpointNumber, job.tspl);
  }
}
