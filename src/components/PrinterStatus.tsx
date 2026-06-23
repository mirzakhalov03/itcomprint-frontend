import { connectPrinterWithToast, usePrinterStore } from '../store/printerStore';
import { PlugIcon } from './icons';

/**
 * Printer state pill + conditional Connect button.
 * Three looks, driven by real adapter state (no demo cycling):
 *  - preview      → dark pill, green dot ("Preview mode")
 *  - connected    → green filled pill ("Printer connected")
 *  - disconnected → red outline pill + Connect button ("Printer not connected")
 */
export function PrinterStatus() {
  const { adapter, status } = usePrinterStore();
  const preview = adapter.kind === 'preview';
  const connected = status === 'connected';

  const label = preview ? 'Preview mode' : connected ? 'Printer connected' : 'Printer not connected';

  const pill = preview
    ? 'bg-ink-2 text-white'
    : connected
      ? 'bg-brand text-white'
      : 'border border-danger text-danger';

  const dot = preview ? 'bg-brand' : connected ? 'bg-white' : 'bg-danger';

  return (
    <div className="relative flex items-center gap-2.5">
      <span
        className={`inline-flex h-[38px] items-center gap-2 rounded-full px-4 font-display text-[13px] font-semibold tracking-[.01em] ${pill}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        {label}
      </span>
      {adapter.kind === 'webusb' && !connected && (
        <button
          onClick={connectPrinterWithToast}
          className="inline-flex h-[38px] items-center gap-[7px] rounded-full bg-brand px-[18px] font-display text-[13px] font-bold tracking-[.02em] text-white transition-colors hover:bg-brand-strong"
        >
          <PlugIcon size={15} strokeWidth={2.4} />
          Connect printer
        </button>
      )}
    </div>
  );
}
