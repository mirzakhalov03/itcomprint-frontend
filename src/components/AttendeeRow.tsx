import { useRef, useState } from 'react';
import { usePrintAttendee } from '../hooks/usePrintAttendee';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { CheckIcon, PrinterIcon } from './icons';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import type { Attendee, BadgeTemplate } from '../types';

export function AttendeeRow({
  attendee,
  eventName,
  template,
  selected,
  onToggle,
}: {
  attendee: Attendee;
  eventName?: string;
  template: BadgeTemplate | undefined;
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
      if (!template) throw new Error('Template still loading — try again.');
      await print.mutateAsync({ attendee, eventName, template });
    } catch (e) {
      setError(true);
      toast(errMessage(e, 'Printer not connected'));
      clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setError(false), 2600);
    }
  }

  const rowBg = selected ? 'bg-brand-tint' : printed ? 'bg-surface-3' : 'bg-white';

  return (
    <div
      className={`flex h-16 items-center gap-3 border-b border-line-3 px-4 transition-colors hover:bg-brand-tint sm:gap-4 sm:px-5 ${rowBg}`}
      style={{ borderLeft: selected ? '3px solid var(--color-brand)' : '3px solid transparent' }}
    >
      <Checkbox
        checked={selected}
        onClick={() => onToggle(attendee._id)}
        label={`Select ${attendee.fullName}`}
      />

      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-base font-semibold leading-tight text-ink">
          {attendee.fullName}
        </div>
        {meta && <div className="truncate text-[13px] leading-[1.3] text-muted">{meta}</div>}
      </div>

      <div className="hidden w-35 items-center sm:flex">
        {printed ? (
          <span className="inline-flex h-6.5 items-center gap-1.25 rounded-full bg-brand-tint pl-2.25 pr-2.75 font-display text-xs font-bold tracking-[.02em] text-brand-deep">
            <CheckIcon size={13} className="text-brand-deep" strokeWidth={3} />
            {attendee.printCount > 1 ? `Printed ×${attendee.printCount}` : 'Printed'}
          </span>
        ) : (
          <span className="inline-flex h-6.5 items-center gap-1.5 rounded-full border border-amber px-3 font-display text-xs font-bold tracking-[.02em] text-amber-ink">
            <span className="h-1.75 w-1.75 rounded-full bg-amber" />
            Not printed
          </span>
        )}
      </div>

      <div className="flex w-23 flex-col items-end gap-0.75 sm:w-31">
        {printed ? (
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={print.isPending || !template}
            className="h-9.5 rounded-[9px] px-3.5 text-[13px] sm:px-4"
          >
            Reprint
          </Button>
        ) : (
          <Button
            onClick={handlePrint}
            disabled={print.isPending || !template}
            className="h-11 gap-1.75 rounded-[9px] px-3.5 text-sm tracking-[.01em] shadow-[0_6px_16px_rgba(111,162,63,.26)] sm:px-5"
          >
            <PrinterIcon size={15} />
            Print
          </Button>
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
