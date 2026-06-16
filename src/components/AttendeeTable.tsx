import { useEffect, useMemo, useRef, useState } from 'react';
import { useAttendees } from '../hooks/useAttendees';
import { usePrintAttendee } from '../hooks/usePrintAttendee';
import { toast } from '../store/toastStore';
import { AttendeeRow } from './AttendeeRow';
import { CheckIcon, PrinterIcon, SearchIcon } from './icons';
import type { Attendee } from '../types';

type Filter = 'all' | 'printed' | 'notprinted';

const isPrinted = (a: Attendee) => a.printStatus === 'printed';
const haystack = (a: Attendee) =>
  (a.fullName + ' ' + Object.values(a.extra).join(' ')).toLowerCase();

function Segment({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-[34px] items-center gap-[7px] rounded-lg px-3.5 font-display text-[13px] font-semibold transition-colors ${
        active ? 'bg-brand text-white' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
      <span className={`font-display text-[11px] font-bold ${active ? 'text-white/85' : 'text-faint'}`}>
        {count}
      </span>
    </button>
  );
}

export function AttendeeTable({ eventId, eventName }: { eventId: string; eventName?: string }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: attendees = [], isLoading } = useAttendees(eventId);
  const print = usePrintAttendee();

  // `/` focuses search (kiosk speed) unless typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'SELECT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const counts = useMemo(() => {
    const printed = attendees.filter(isPrinted).length;
    return { all: attendees.length, printed, notprinted: attendees.length - printed };
  }, [attendees]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attendees.filter((a) => {
      if (filter === 'printed' && !isPrinted(a)) return false;
      if (filter === 'notprinted' && isPrinted(a)) return false;
      if (q && !haystack(a).includes(q)) return false;
      return true;
    });
  }, [attendees, search, filter]);

  const allChecked = visible.length > 0 && visible.every((a) => selected.has(a._id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) visible.forEach((a) => next.delete(a._id));
      else visible.forEach((a) => next.add(a._id));
      return next;
    });
  }

  async function batchPrint() {
    const targets = attendees.filter((a) => selected.has(a._id));
    if (!targets.length) return;
    setBatchRunning(true);
    try {
      for (const a of targets) {
        await print.mutateAsync({ attendee: a, eventName }); // one label at a time
      }
      setSelected(new Set());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Batch print failed');
    } finally {
      setBatchRunning(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.05)]">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-white p-4">
        <div className="relative flex min-w-[200px] flex-1 items-center">
          <SearchIcon size={17} className="absolute left-3.5 text-faint" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search attendees…   (press / )"
            className="h-[42px] w-full rounded-[10px] border border-line-2 bg-surface pl-10 pr-3.5 text-sm text-ink outline-none placeholder:text-faint"
          />
        </div>

        <div className="inline-flex gap-0.5 rounded-[10px] border border-line bg-surface p-[3px]">
          <Segment label="All" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
          <Segment
            label="Printed"
            count={counts.printed}
            active={filter === 'printed'}
            onClick={() => setFilter('printed')}
          />
          <Segment
            label="Not printed"
            count={counts.notprinted}
            active={filter === 'notprinted'}
            onClick={() => setFilter('notprinted')}
          />
        </div>

        {selected.size > 0 && (
          <button
            onClick={batchPrint}
            disabled={batchRunning}
            className="animate-fade-in inline-flex h-[42px] items-center gap-2 rounded-[10px] bg-brand px-5 font-display text-sm font-bold tracking-[.01em] text-white shadow-[0_8px_22px_rgba(111,162,63,.28)] transition-colors hover:bg-brand-strong disabled:opacity-60"
          >
            <PrinterIcon size={16} />
            {batchRunning
              ? 'Printing…'
              : `Print ${selected.size} ${selected.size === 1 ? 'badge' : 'badges'}`}
          </button>
        )}
      </div>

      {/* List header */}
      <div className="flex items-center gap-4 border-b border-line-3 bg-surface-2 px-5 py-[9px]">
        <button
          onClick={toggleAll}
          role="checkbox"
          aria-checked={allChecked}
          aria-label="Select all visible"
          className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md ${
            allChecked ? 'border border-brand bg-brand' : 'border-[1.5px] border-[#c8ccc2] bg-white'
          }`}
        >
          {allChecked && <CheckIcon size={13} className="text-white" strokeWidth={3.4} />}
        </button>
        <span className="flex-1 font-display text-[11px] font-semibold uppercase tracking-[.08em] text-faint">
          Attendee
        </span>
        <span className="w-[140px] font-display text-[11px] font-semibold uppercase tracking-[.08em] text-faint">
          Status
        </span>
        <span className="w-[124px]" />
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="px-6 py-16 text-center text-sm text-muted">Loading attendees…</div>
      ) : visible.length > 0 ? (
        <div>
          {visible.map((a) => (
            <AttendeeRow
              key={a._id}
              attendee={a}
              eventName={eventName}
              selected={selected.has(a._id)}
              onToggle={toggle}
            />
          ))}
        </div>
      ) : (
        <div className="px-6 py-16 text-center">
          <div className="font-display text-[17px] font-bold text-ink-3">
            {counts.all === 0 ? 'No attendees yet' : 'No matches'}
          </div>
          <div className="mt-1.5 text-sm text-muted">
            {counts.all === 0
              ? 'Import a spreadsheet to add attendees to this event.'
              : 'No attendees match your search or filter.'}
          </div>
        </div>
      )}
    </div>
  );
}
