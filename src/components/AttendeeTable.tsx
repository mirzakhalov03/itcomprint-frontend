import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useAttendees } from '../hooks/useAttendees';
import { usePrintAttendee } from '../hooks/usePrintAttendee';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { AttendeeRow } from './AttendeeRow';
import { CloseIcon, PrinterIcon, RefreshIcon, SearchIcon } from './icons';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { EmptyState, LoadingPanel } from './ui/EmptyState';
import { useEventTemplate } from '../hooks/useEventTemplate';
import { useSheetSync } from '../hooks/useSheetSync';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { TemplateSelect } from './TemplateSelect';
import { SheetIssuesNotice } from './SheetIssuesNotice';
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
      className={`inline-flex h-8.5 flex-1 items-center justify-center gap-1.75 whitespace-nowrap rounded-lg px-2 font-display lg:flex-none lg:px-3.5 text-[13px] font-semibold transition-colors ${
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
  const { template: activeTemplate } = useEventTemplate(event);
  const { syncNow, isSyncing, issues } = useSheetSync(eventId, !!event.sheetId);
  const [searchInput, setSearchInput] = useState('');
  const search = useDeferredValue(searchInput); // input stays instant; filtering yields to typing
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isDesktop = useIsDesktop();

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
      const el = document.activeElement as HTMLElement | null;
      const typing =
        !!el && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
      if (e.key === '/' && !typing) {
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

  // Built once per roster, not per keystroke.
  const haystacks = useMemo(() => new Map(attendees.map((a) => [a._id, haystack(a)])), [attendees]);

  const matchAll = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      return attendees.filter((a) => {
        if (filter === 'printed' && !isPrinted(a)) return false;
        if (filter === 'notprinted' && isPrinted(a)) return false;
        if (q && !haystacks.get(a._id)!.includes(q)) return false;
        return true;
      });
    },
    [attendees, haystacks, filter],
  );

  const visible = useMemo(() => matchAll(search), [matchAll, search]);

  const allChecked = visible.length > 0 && visible.every((a) => selected.has(a._id));

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
    if (!activeTemplate) return toast('Template still loading — try again.');
    let failed = 0;
    let lastError: unknown;
    setBatch({ done: 0, total: targets.length });
    for (const [i, a] of targets.entries()) {
      try {
        await print.mutateAsync({ attendee: a, eventName, template: activeTemplate });
        // Deselect as we go so a re-run only retries what failed.
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(a._id);
          return next;
        });
      } catch (e) {
        failed++;
        lastError = e;
      }
      setBatch({ done: i + 1, total: targets.length });
    }
    setBatch(null);
    const printed = targets.length - failed;
    toast(
      failed === 0
        ? `${printed} ${printed === 1 ? 'badge' : 'badges'} printed`
        : `${printed} printed · ${failed} failed (${errMessage(lastError, 'unknown error')}) — failed ones stay selected`,
    );
  }

  // Enter opens the only match; on touch it also dismisses the keyboard to reveal results.
  // Matches the live input, not the deferred `search`, so a fast Enter isn't a keystroke behind.
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const hits = matchAll(searchInput);
    if (hits.length === 1 && activeTemplate) onPreview(hits[0]);
    if (!isDesktop) e.currentTarget.blur();
  }

  const syncButton = event.sheetId && (
    <button
      onClick={syncNow}
      disabled={isSyncing}
      className="inline-flex h-10.5 shrink-0 items-center gap-2 rounded-[10px] border border-brand/30 bg-brand-tint px-3.5 font-display lg:px-4 text-sm font-semibold text-brand-deep transition-colors hover:border-brand/50 hover:bg-brand-tint/70 disabled:opacity-60"
      title={
        event.lastSyncedAt
          ? `Last synced ${new Date(event.lastSyncedAt).toLocaleTimeString()}`
          : undefined
      }
    >
      <RefreshIcon size={15} className={isSyncing ? 'animate-spin' : undefined} />
      {isSyncing ? 'Syncing…' : isDesktop ? 'Sync now' : 'Sync'}
    </button>
  );

  const batchButton = selected.size > 0 && (
    <Button
      onClick={batchPrint}
      disabled={!!batch}
      className="animate-fade-in h-10.5 flex-1 gap-2 rounded-[10px] px-5 text-sm tracking-[.01em] shadow-[0_8px_22px_rgba(111,162,63,.28)] lg:flex-none"
    >
      <PrinterIcon size={16} />
      {batch
        ? `Printing ${Math.min(batch.done + 1, batch.total)}/${batch.total}…`
        : `Print ${selected.size} ${selected.size === 1 ? 'badge' : 'badges'}`}
    </Button>
  );

  return (
    <>
      {/* Handheld: per-event settings scroll away so the sticky bar stays short. */}
      {!isDesktop && (
        <div className="mb-3 flex items-center gap-2.5">
          <TemplateSelect event={event} className="min-w-0 flex-1" />
          {syncButton}
        </div>
      )}

      {/* overflow-clip, not hidden: hidden would make the card the sticky toolbar's scroll container. */}
      <div className="overflow-clip rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.05)]">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2.5 border-b border-line bg-white p-3 sm:gap-3 sm:p-4">
          <div className="relative flex basis-full items-center lg:min-w-50 lg:flex-1 lg:basis-auto">
            <SearchIcon size={17} className="pointer-events-none absolute left-3.5 text-faint" />
            <input
              ref={searchRef}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={isDesktop ? 'Search attendees…   (press / )' : 'Search name or ID'}
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-10.5 w-full rounded-[10px] border border-line-2 bg-surface pl-10 pr-10 text-sm text-ink outline-none transition-shadow duration-150 placeholder:text-faint focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('');
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-1 flex h-9 w-9 items-center justify-center rounded-lg text-faint hover:text-ink"
              >
                <CloseIcon size={15} />
              </button>
            )}
          </div>

          {isDesktop && <TemplateSelect event={event} />}

          <div className="flex w-full gap-0.5 rounded-[10px] border border-line bg-surface p-0.75 lg:inline-flex lg:w-auto">
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

          {isDesktop && syncButton}
          {isDesktop && batchButton}
        </div>

        <SheetIssuesNotice issues={issues} />

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

        {/* Handheld: batch actions pinned in thumb reach. */}
        {!isDesktop && batchButton && (
          <div className="sticky bottom-0 z-10 flex items-center gap-2.5 border-t border-line bg-white/95 px-3 pb-safe pt-3 backdrop-blur">
            <Button
              variant="secondary"
              onClick={() => setSelected(new Set())}
              disabled={!!batch}
              className="h-10.5 shrink-0 rounded-[10px] px-4 text-sm"
            >
              Clear
            </Button>
            {batchButton}
          </div>
        )}
      </div>
    </>
  );
}
