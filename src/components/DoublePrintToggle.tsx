import { usePrinterStore } from '../store/printerStore';
import { Checkbox } from './ui/Checkbox';

/** Kiosk-wide switch: every print (row, batch, panel) sends two copies while checked. */
export function DoublePrintToggle() {
  const double = usePrinterStore((s) => s.double);
  const setDouble = usePrinterStore((s) => s.setDouble);
  const toggle = () => setDouble(!double);

  return (
    <div className="flex items-center gap-2.5">
      <Checkbox checked={double} onClick={toggle} label="Double print" />
      {/* The checkbox carries the accessible name; the text is just a bigger click target. */}
      <span
        onClick={toggle}
        aria-hidden
        className="cursor-pointer select-none text-sm font-semibold text-ink"
      >
        Double print
      </span>
    </div>
  );
}
