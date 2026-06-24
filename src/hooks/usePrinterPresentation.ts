import { usePrinterStore } from '../store/printerStore';

/**
 * Shared read of printer state for the UI: whether we're in preview mode, whether
 * a real printer is connected, and whether to offer a Connect action. The header
 * pill and the Printer page each map these to their own labels and styling.
 */
export function usePrinterPresentation() {
  const { adapter, status } = usePrinterStore();
  const preview = adapter.kind === 'preview';
  const isWebUsb = adapter.kind === 'webusb';
  const connected = status === 'connected';

  return { preview, isWebUsb, connected, showConnect: isWebUsb && !connected };
}
