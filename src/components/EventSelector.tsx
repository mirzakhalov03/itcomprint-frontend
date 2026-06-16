import { useEffect, useRef, useState } from 'react';
import { useEvents } from '../hooks/useEvents';
import { ChevronDownIcon } from './icons';
import type { AppEvent } from '../types';

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CountChip({ count }: { count: number }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-full bg-brand-tint px-[9px] font-display text-xs font-bold text-brand-deep">
      {count}
    </span>
  );
}

/** Pill-shaped custom dropdown for picking the active event, with per-event counts. */
export function EventSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { data: events = [] } = useEvents();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selected: AppEvent | undefined = events.find((e) => e._id === value);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 items-center gap-3 rounded-full border border-line-2 bg-white px-4 shadow-[0_1px_2px_rgba(0,0,0,.04)] transition-colors hover:border-[#c8ccc2]"
      >
        <span className="font-display text-[15px] font-semibold text-ink">
          {selected?.name ?? 'Select an event…'}
        </span>
        {selected && <CountChip count={selected.attendeeCount ?? 0} />}
        <ChevronDownIcon
          size={16}
          className={`text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="animate-dlg-in absolute left-0 top-[52px] z-40 min-w-[300px] rounded-[14px] border border-line bg-white p-1.5 shadow-[0_14px_38px_rgba(0,0,0,.14)]">
          {events.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted">
              No events yet — import a spreadsheet.
            </div>
          )}
          {events.map((ev) => (
            <button
              key={ev._id}
              onClick={() => {
                onChange(ev._id);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-surface ${
                ev._id === value ? 'bg-brand-tint' : ''
              }`}
            >
              <span className="flex flex-col gap-0.5">
                <span className="font-display text-sm font-semibold text-ink">{ev.name}</span>
                <span className="text-xs text-muted">{formatDate(ev.date)}</span>
              </span>
              <CountChip count={ev.attendeeCount ?? 0} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
