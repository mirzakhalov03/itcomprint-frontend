import { useRef, useState } from 'react';
import { usePrintAttendee } from '../hooks/usePrintAttendee';
import { toast } from '../store/toastStore';
import { CheckIcon, PrinterIcon } from './icons';
import type { Attendee } from '../types';

export function AttendeeRow({
  attendee,
  eventName,
  selected,
  onToggle,
}: {
  attendee: Attendee;
  eventName?: string;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const print = usePrintAttendee();
  const [error, setError] = useState(false);
  const errTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const printed = attendee.printStatus === 'printed';
  const meta = Object.values(attendee.extra).join('  ·  ');

  async function handlePrint() {
    try {
      setError(false);
      await print.mutateAsync({ attendee, eventName });
    } catch (e) {
      setError(true);
      toast(e instanceof Error ? e.message : 'Printer not connected');
      clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setError(false), 2600);
    }
  }

  const rowBg = selected ? 'bg-brand-tint' : printed ? 'bg-surface-3' : 'bg-white';

  return (
    <div
      className={`flex h-16 items-center gap-4 border-b border-line-3 px-5 transition-colors hover:bg-brand-tint ${rowBg}`}
      style={{ borderLeft: selected ? '3px solid var(--color-brand)' : '3px solid transparent' }}
    >
      <button
        onClick={() => onToggle(attendee._id)}
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select ${attendee.fullName}`}
        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md transition-all ${
          selected ? 'border border-brand bg-brand' : 'border-[1.5px] border-[#c8ccc2] bg-white'
        }`}
      >
        {selected && <CheckIcon size={13} className="text-white" strokeWidth={3.4} />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-base font-semibold leading-[1.25] text-ink">
          {attendee.fullName}
        </div>
        {meta && <div className="truncate text-[13px] leading-[1.3] text-muted">{meta}</div>}
      </div>

      <div className="flex w-[140px] items-center">
        {printed ? (
          <span className="inline-flex h-[26px] items-center gap-[5px] rounded-full bg-brand-tint pl-[9px] pr-[11px] font-display text-xs font-bold tracking-[.02em] text-brand-deep">
            <CheckIcon size={13} className="text-brand-deep" strokeWidth={3} />
            {attendee.printCount > 1 ? `Printed ×${attendee.printCount}` : 'Printed'}
          </span>
        ) : (
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-amber px-3 font-display text-xs font-bold tracking-[.02em] text-amber-ink">
            <span className="h-[7px] w-[7px] rounded-full bg-amber" />
            Not printed
          </span>
        )}
      </div>

      <div className="flex w-[124px] flex-col items-end gap-[3px]">
        {printed ? (
          <button
            onClick={handlePrint}
            disabled={print.isPending}
            className="inline-flex h-[38px] items-center rounded-[9px] border border-brand-line bg-white px-4 font-display text-[13px] font-bold text-brand-deep transition-colors hover:bg-brand-tint disabled:opacity-50"
          >
            Reprint
          </button>
        ) : (
          <button
            onClick={handlePrint}
            disabled={print.isPending}
            className="inline-flex h-11 items-center gap-[7px] rounded-[9px] bg-brand px-5 font-display text-sm font-bold tracking-[.01em] text-white shadow-[0_6px_16px_rgba(111,162,63,.26)] transition-colors hover:bg-brand-strong disabled:opacity-50"
          >
            <PrinterIcon size={15} />
            Print
          </button>
        )}
        {error && (
          <span className="whitespace-nowrap text-[11px] font-semibold text-danger">
            Printer not connected
          </span>
        )}
      </div>
    </div>
  );
}
