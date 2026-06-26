import type { ReactNode } from 'react';
import { CheckIcon, PrinterIcon } from './icons';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import type { Attendee, BadgeTemplate } from '../types';

function highlight(text: string, query: string): ReactNode {
  const q = query.trim().toLowerCase();
  if (!q) return text;
  const parts: ReactNode[] = [];
  let last = 0;
  let i = text.toLowerCase().indexOf(q, last);
  while (i !== -1) {
    if (i > last) parts.push(text.slice(last, i));
    parts.push(
      <mark key={i} className="rounded-[3px] bg-brand px-[1px] text-white not-italic">
        {text.slice(i, i + q.length)}
      </mark>,
    );
    last = i + q.length;
    i = text.toLowerCase().indexOf(q, last);
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function AttendeeRow({
  attendee,
  search = '',
  template,
  selected,
  isPreviewing = false,
  onToggle,
  onPreview,
}: {
  attendee: Attendee;
  search?: string;
  template: BadgeTemplate | undefined;
  selected: boolean;
  isPreviewing?: boolean;
  onToggle: (id: string) => void;
  onPreview: (a: Attendee) => void;
}) {
  const printed = attendee.printStatus === 'printed';
  const regNumber = attendee.extra['Reg. Number'] ?? '';

  const rowBg = selected
    ? 'bg-brand-tint'
    : isPreviewing
      ? 'bg-surface-2'
      : printed
        ? 'bg-surface-3'
        : 'bg-white';
  const leftBorder =
    selected || isPreviewing ? '3px solid var(--color-brand)' : '3px solid transparent';

  return (
    <div
      className={`flex h-16 items-center gap-3 border-b border-line-3 px-4 transition-colors hover:bg-brand-tint sm:gap-4 sm:px-5 ${rowBg}`}
      style={{ borderLeft: leftBorder }}
    >
      <Checkbox
        checked={selected}
        onClick={() => onToggle(attendee._id)}
        label={`Select ${attendee.fullName}`}
      />

      <span className="w-8 shrink-0 font-display text-[12px] font-bold text-faint">
        {highlight(regNumber, search)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-base font-semibold leading-tight text-ink">
          {highlight(attendee.fullName, search)}
        </div>
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
            onClick={() => onPreview(attendee)}
            disabled={!template}
            className="h-9.5 rounded-[9px] px-3.5 text-[13px] sm:px-4"
          >
            Reprint
          </Button>
        ) : (
          <Button
            onClick={() => onPreview(attendee)}
            disabled={!template}
            className="h-11 gap-1.75 rounded-[9px] px-3.5 text-sm tracking-[.01em] shadow-[0_6px_16px_rgba(111,162,63,.26)] sm:px-5"
          >
            <PrinterIcon size={15} />
            Print
          </Button>
        )}
      </div>
    </div>
  );
}
