import { connectPrinterWithToast } from '../store/printerStore';
import { usePrinterPresentation } from '../hooks/usePrinterPresentation';
import { PlugIcon } from './icons';
import { Button } from './ui/Button';

/**
 * Printer state pill + conditional Connect button.
 * Three looks, driven by real adapter state (no demo cycling):
 *  - preview      → dark pill, green dot ("Preview mode")
 *  - connected    → green filled pill ("Printer connected")
 *  - disconnected → red outline pill + Connect button ("Printer not connected")
 */
export function PrinterStatus() {
  const { preview, connected, showConnect } = usePrinterPresentation();

  const label = preview
    ? 'Preview mode'
    : connected
      ? 'Printer connected'
      : 'Printer not connected';

  const pill = preview
    ? 'bg-ink-2 text-white'
    : connected
      ? 'bg-brand text-white'
      : 'border border-danger text-danger';

  const dot = preview ? 'bg-brand' : connected ? 'bg-white' : 'bg-danger';

  return (
    <div className="relative flex shrink-0 items-center gap-2">
      <span
        className={`inline-flex h-[38px] shrink-0 items-center gap-2 rounded-full px-3 font-display text-[13px] font-semibold tracking-[.01em] sm:px-4 ${pill}`}
        title={label}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="hidden sm:inline">{label}</span>
      </span>
      {showConnect && (
        <Button
          onClick={connectPrinterWithToast}
          aria-label="Connect printer"
          className="h-[38px] shrink-0 gap-[7px] rounded-full px-3 text-[13px] tracking-[.02em] sm:px-[18px]"
        >
          <PlugIcon size={15} strokeWidth={2.4} />
          <span className="hidden sm:inline">Connect printer</span>
        </Button>
      )}
    </div>
  );
}
