import { useCallback, useDeferredValue, useEffect, useMemo, useState, type RefObject } from 'react';
import { useAttendees } from '../hooks/useAttendees';
import { usePrintAttendee, useUnprintAttendee } from '../hooks/usePrintAttendee';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { regNumberOf } from '../lib/format';
import { AttendeeRow } from './AttendeeRow';
import { CloseIcon, PrinterIcon, RefreshIcon, SearchIcon } from './icons';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { EmptyState, LoadingPanel } from './ui/EmptyState';
import { useEventTemplate } from '../hooks/useEventTemplate';
import { useSheetSync } from '../hooks/useSheetSync';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { TemplateSelect } from './TemplateSelect';
import { AttendeeStats } from './AttendeeStats';
import { SheetIssuesNotice } from './SheetIssuesNotice';
import type { Attendee, AppEvent } from '../types';

const isPrinted = (a: Attendee) => a.printStatus === 'printed';
const haystack = (a: Attendee) =>
  (
    a.fullName +
    ' ' +
    (a.registrantId ?? '') +
    ' ' +
    Object.values(a.extra).join(' ')
  ).toLowerCase();

export function AttendeeTable({
  event,
  onPreview,
  previewId,
  searchRef,
}: {
  event: AppEvent;
  onPreview: (a: Attendee) => void;
  previewId?: string;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const eventId = event._id;
  const eventName = event.name;
  const { template: activeTemplate } = useEventTemplate(event);
  const { syncNow, isSyncing, issues } = useSheetSync(eventId, !!event.sheetId);
  const [searchInput, setSearchInput] = useState('');
  const search = useDeferredValue(searchInput); // input stays instant; filtering yields to typing
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  // Keyboard cursor for ↑/↓ when a search has several hits; cleared on every keystroke.
  const [activeId, setActiveId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();

  const { data: attendees = [], isLoading } = useAttendees(eventId);
  const print = usePrintAttendee();
  const unprint = useUnprintAttendee();
  const [confirmUnprint, setConfirmUnprint] = useState(false);

  // `/` or Ctrl+F / Cmd+F focuses search (kiosk speed). Selecting lets the next ID overwrite the last.
  useEffect(() => {
    function focusSearch(e: KeyboardEvent) {
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') return focusSearch(e);
      const el = document.activeElement as HTMLElement | null;
      const typing =
        !!el && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
      if (e.key === '/' && !typing) focusSearch(e);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchRef]);

  const printedCount = useMemo(() => attendees.filter(isPrinted).length, [attendees]);

  // Built once per roster, not per keystroke.
  const haystacks = useMemo(() => new Map(attendees.map((a) => [a._id, haystack(a)])), [attendees]);

  const matchAll = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      return attendees.filter((a) => {
        if (q && !haystacks.get(a._id)!.includes(q)) return false;
        return true;
      });
    },
    [attendees, haystacks],
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

  // Only printed ones can be unprinted; the rest of the selection is left alone.
  const selectedPrinted = useMemo(
    () => attendees.filter((a) => selected.has(a._id) && isPrinted(a)),
    [attendees, selected],
  );

  // DB-only (no printer), so run in parallel. Successes are deselected; failures stay for retry.
  async function batchUnprint() {
    const targets = selectedPrinted;
    const results = await Promise.allSettled(targets.map((a) => unprint.mutateAsync(a)));
    const done = targets.filter((_, i) => results[i].status === 'fulfilled').map((a) => a._id);
    setSelected((prev) => {
      const next = new Set(prev);
      done.forEach((id) => next.delete(id));
      return next;
    });
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    const failedCount = targets.length - done.length;
    toast(
      failedCount === 0
        ? `${done.length} marked as not printed`
        : `${done.length} marked · ${failedCount} failed (${errMessage(failed?.reason, 'unknown error')}) — failed ones stay selected`,
    );
  }

  // Enter target: the arrowed-to row, else an exact Reg. Number (typing "189" also hits "1890"), else the only hit.
  // Matches the live input, not the deferred `search`, so a fast Enter isn't a keystroke behind.
  function enterTarget(): Attendee | undefined {
    const hits = matchAll(searchInput);
    const q = searchInput.trim();
    return (
      hits.find((a) => a._id === activeId) ??
      (q ? hits.find((a) => regNumberOf(a) === q) : undefined) ??
      (hits.length === 1 ? hits[0] : undefined)
    );
  }

  function moveActive(step: 1 | -1) {
    const i = visible.findIndex((a) => a._id === activeId);
    const next = visible[Math.min(Math.max(i + step, 0), visible.length - 1)];
    if (next) setActiveId(next._id);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); // keep the caret put
      moveActive(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Escape' && !previewId && searchInput) {
      setSearchInput(''); // with the panel open, Escape closes it instead (KioskPage)
      setActiveId(null);
    } else if (e.key === 'Enter') {
      // Focus jumps to Print mid-keystroke; without this the same Enter would click it.
      e.preventDefault();
      const target = enterTarget();
      if (target && activeTemplate) onPreview(target);
      // On touch, dismiss the keyboard to reveal results.
      if (!isDesktop) e.currentTarget.blur();
    }
  }

  const syncButton = event.sheetId && (
    <button
      onClick={syncNow}
      disabled={isSyncing}
      className="flex h-10.5 w-13 shrink-0 flex-col items-center justify-center gap-0.75 rounded-[10px] border border-brand/30 bg-brand-tint font-display text-brand-deep transition-colors hover:border-brand/50 hover:bg-brand-tint/70 disabled:opacity-60"
      title={
        event.lastSyncedAt
          ? `Sync now · last synced ${new Date(event.lastSyncedAt).toLocaleTimeString()}`
          : 'Sync now'
      }
    >
      <RefreshIcon size={16} className={isSyncing ? 'animate-spin' : undefined} />
      <span className="text-[9.5px] font-semibold uppercase leading-none tracking-[.06em]">
        {isSyncing ? 'Syncing' : 'Sync'}
      </span>
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

  const unprintButton = selectedPrinted.length > 0 && (
    <Button
      variant="secondary"
      onClick={() => setConfirmUnprint(true)}
      disabled={!!batch}
      title="Printed by mistake? Count these attendees as not arrived again."
      className="animate-fade-in h-10.5 shrink-0 rounded-[10px] px-4 text-sm"
    >
      {isDesktop ? `Mark ${selectedPrinted.length} unprinted` : `Unprint ${selectedPrinted.length}`}
    </Button>
  );

  return (
    <>
      {confirmUnprint && (
        <ConfirmDialog
          size="sm"
          title={`Mark ${selectedPrinted.length} as not printed?`}
          description="Their print status and count reset, so stats treat them as not arrived. Badges already printed aren't affected."
          confirmLabel="Mark unprinted"
          pendingLabel="Saving…"
          errorFallback="Could not mark as not printed"
          onConfirm={batchUnprint}
          onClose={() => setConfirmUnprint(false)}
        />
      )}

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
              onChange={(e) => {
                setSearchInput(e.target.value);
                setActiveId(null);
              }}
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
                  setActiveId(null);
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-1 flex h-9 w-9 items-center justify-center rounded-lg text-faint hover:text-ink"
              >
                <CloseIcon size={15} />
              </button>
            )}
          </div>

          {isDesktop && <TemplateSelect event={event} className="w-52 shrink-0" />}

          <AttendeeStats
            total={attendees.length}
            came={printedCount}
            className="w-full lg:w-auto"
          />

          {isDesktop && syncButton}
          {isDesktop && unprintButton}
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
                isActive={activeId === a._id}
                onToggle={toggle}
                onPreview={onPreview}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            bordered={false}
            title={attendees.length === 0 ? 'No attendees yet' : 'No matches'}
            subtitle={
              attendees.length === 0
                ? 'Import a spreadsheet to add attendees to this event.'
                : 'No attendees match your search.'
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
            {unprintButton}
            {batchButton}
          </div>
        )}
      </div>
    </>
  );
}
