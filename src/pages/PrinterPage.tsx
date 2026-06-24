import { connectPrinterWithToast } from '../store/printerStore';
import { usePrinterPresentation } from '../hooks/usePrinterPresentation';
import { PlugIcon, PrinterIcon } from '../components/icons';
import { Button } from '../components/ui/Button';

export function PrinterPage() {
  const { preview, connected, isWebUsb, showConnect } = usePrinterPresentation();

  const label = preview ? 'Preview mode' : connected ? 'Connected' : 'Not connected';
  const desc = preview
    ? 'Badges render to the on-screen preview tray. No physical printer is attached.'
    : connected
      ? 'A label printer is connected over WebUSB and ready to print.'
      : 'Connect your Gainscha label printer over USB to start printing badges.';

  const iconBox = connected
    ? 'bg-brand text-white'
    : preview
      ? 'bg-ink-2 text-white'
      : 'bg-surface text-muted';

  return (
    <div className="max-w-[560px]">
      <h1 className="mb-5 font-display text-xl font-bold text-ink">Printer</h1>
      <div className="rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconBox}`}>
            <PrinterIcon size={20} />
          </div>
          <div>
            <div className="font-display text-base font-bold text-ink">{label}</div>
            <div className="text-xs uppercase tracking-wide text-faint">
              {isWebUsb ? 'WebUSB' : 'Preview'}
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted">{desc}</p>
        {showConnect && (
          <Button
            onClick={connectPrinterWithToast}
            className="mt-5 h-11 gap-2 rounded-full px-5 text-sm"
          >
            <PlugIcon size={16} /> Connect printer
          </Button>
        )}
      </div>
    </div>
  );
}
