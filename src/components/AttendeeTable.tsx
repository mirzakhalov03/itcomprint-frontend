import { useEffect, useMemo, useRef, useState } from 'react';
import { useAttendees } from '../hooks/useAttendees';
import { usePrintAttendee } from '../hooks/usePrintAttendee';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { AttendeeRow } from './AttendeeRow';
import { PrinterIcon, RefreshIcon, SearchIcon } from './icons';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { EmptyState, LoadingPanel } from './ui/EmptyState';
import { useTemplates } from '../hooks/useTemplates';
import { useSheetSync } from '../hooks/useSheetSync';
import { TemplateSelect } from './TemplateSelect';
import type { Attendee, AppEvent } from '../types';

type Filter = 'all' | 'printed' | 'notprinted';

const isPrinted = (a: Attendee) => a.printStatus === 'printed';
const haystack = (a: Attendee) =>
  (
    a.fullName +
    ' ' +
    (a.registrantId ?? '') +
    ' ' +
    Object.values(a.extra).join(' ')
  ).toLowerCase();

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
      className={`inline-flex h-8.5 items-center gap-1.75 rounded-lg px-3.5 font-display text-[13px] font-semibold transition-colors ${
        active ? 'bg-brand text-white' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
      <span
        className={`font-display text-[11px] font-bold ${active ? 'text-white/85' : 'text-faint'}`}
      >
        {count}
      </span>
    </button>
  );
}

export function AttendeeTable({
  event,
  onPreview,
  previewId,
}: {
  event: AppEvent;
  onPreview: (a: Attendee) => void;
  previewId?: string;
}) {
  const eventId = event._id;
  const eventName = event.name;
  const { data: templates = [] } = useTemplates();
  const { syncNow, isSyncing } = useSheetSync(eventId, !!event.sheetId);
  const activeTemplate =
    templates.find((t) => t._id === event.templateId) ?? templates.find((t) => t.isDefault);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Input updates instantly; filtering/highlighting lag 300ms behind so fast typing doesn't refilter every keystroke.
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearch(searchInput), 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchInput]);

  const { data: attendees = [], isLoading } = useAttendees(eventId);
  const print = usePrintAttendee();

  // `/` or Ctrl+F / Cmd+F focuses search (kiosk speed).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
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
      if (!activeTemplate) throw new Error('Template still loading — try again.');
      for (const a of targets) {
        await print.mutateAsync({ attendee: a, eventName, template: activeTemplate }); // one label at a time
      }
      setSelected(new Set());
    } catch (e) {
      toast(errMessage(e, 'Batch print failed'));
    } finally {
      setBatchRunning(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.05)]">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-white p-4">
        <div className="relative flex min-w-50 flex-1 items-center">
          <SearchIcon size={17} className="absolute left-3.5 text-faint" />
          <input
            ref={searchRef}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search attendees…   (press / )"
            className="h-10.5 w-full rounded-[10px] border border-line-2 bg-surface pl-10 pr-3.5 text-sm text-ink outline-none transition-shadow duration-150 placeholder:text-faint focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
          />
        </div>

        <TemplateSelect event={event} templates={templates} />

        <div className="inline-flex gap-0.5 rounded-[10px] border border-line bg-surface p-0.75">
          <Segment
            label="All"
            count={counts.all}
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
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

        {event.sheetId && (
          <button
            onClick={syncNow}
            disabled={isSyncing}
            className="inline-flex h-10.5 shrink-0 items-center gap-2 rounded-[10px] border border-brand/30 bg-brand-tint px-4 font-display text-sm font-semibold text-brand-deep transition-colors hover:border-brand/50 hover:bg-brand-tint/70 disabled:opacity-60"
            title={
              event.lastSyncedAt
                ? `Last synced ${new Date(event.lastSyncedAt).toLocaleTimeString()}`
                : undefined
            }
          >
            <RefreshIcon size={15} className={isSyncing ? 'animate-spin' : undefined} />
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}

        {selected.size > 0 && (
          <Button
            onClick={batchPrint}
            disabled={batchRunning}
            className="animate-fade-in h-10.5 gap-2 rounded-[10px] px-5 text-sm tracking-[.01em] shadow-[0_8px_22px_rgba(111,162,63,.28)]"
          >
            <PrinterIcon size={16} />
            {batchRunning
              ? 'Printing…'
              : `Print ${selected.size} ${selected.size === 1 ? 'badge' : 'badges'}`}
          </Button>
        )}
      </div>

      {/* List header */}
      <div className="flex items-center gap-3 border-b border-line-3 bg-surface-2 px-4 py-2.25 sm:gap-4 sm:px-5">
        <Checkbox checked={allChecked} onClick={toggleAll} label="Select all visible" />
        <span className="w-8 shrink-0 font-display text-[11px] font-semibold uppercase tracking-[.08em] text-faint">
          ID
        </span>
        <span className="flex-1 font-display text-[11px] font-semibold uppercase tracking-[.08em] text-faint">
          Full Name
        </span>
        <span className="hidden w-35 font-display text-[11px] font-semibold uppercase tracking-[.08em] text-faint sm:block">
          Status
        </span>
        <span className="w-23 sm:w-31" />
      </div>

      {/* Body */}
      {isLoading ? (
        <LoadingPanel>Loading attendees…</LoadingPanel>
      ) : visible.length > 0 ? (
        <div>
          {visible.map((a) => (
            <AttendeeRow
              key={a._id}
              attendee={a}
              search={search}
              template={activeTemplate}
              selected={selected.has(a._id)}
              isPreviewing={previewId === a._id}
              onToggle={toggle}
              onPreview={onPreview}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          bordered={false}
          title={counts.all === 0 ? 'No attendees yet' : 'No matches'}
          subtitle={
            counts.all === 0
              ? 'Import a spreadsheet to add attendees to this event.'
              : 'No attendees match your search or filter.'
          }
        />
      )}
    </div>
  );
}
