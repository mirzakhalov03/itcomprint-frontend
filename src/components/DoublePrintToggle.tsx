import { usePrinterStore } from '../store/printerStore';
import { Checkbox } from './ui/Checkbox';

/** Kiosk-wide switch: every print (row, batch, panel) sends two copies while checked. */
export function DoublePrintToggle() {
  const double = usePrinterStore((s) => s.double);
  const setDouble = usePrinterStore((s) => s.setDouble);
  const toggle = () => setDouble(!double);

  return (
    <div
      className="inline-flex h-10.5 shrink-0 items-center gap-2 lg:h-9"
      title="Print two copies of each badge"
    >
      <Checkbox checked={double} onClick={toggle} label="Double print — two copies per badge" />
      {/* The checkbox carries the accessible name; the text is just a bigger click target. */}
      <span
        onClick={toggle}
        aria-hidden
        className="cursor-pointer select-none font-display text-[11px] font-semibold uppercase tracking-wide text-faint"
      >
        Double
      </span>
    </div>
  );
}
