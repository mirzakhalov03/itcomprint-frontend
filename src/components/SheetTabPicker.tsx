import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import { cn } from '../lib/cn';
import { CheckIcon, ChevronDownIcon, RefreshIcon, SearchIcon } from './icons';
import type { SheetTab, SheetTabStatus } from '../types';

const USED_LABEL: Record<Exclude<SheetTabStatus, 'available'>, string> = {
  linked: 'Added',
  trashed: 'In trash',
};

// Sheet titles often carry doubled spaces ("Tour  | Topex") — collapse them for display and search.
const tidy = (title: string) => title.replace(/\s+/g, ' ').trim();
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Bolds each searched word inside a title so the operator sees why it matched. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <mark key={i} className="bg-transparent font-semibold text-brand-deep">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * Searchable picker for Main Sheet tabs. Keeps sheet order (newest events first), matches
 * every typed word anywhere in the title, and parks tabs that already have an event at the end.
 */
export function SheetTabPicker({
  tabs,
  value,
  onChange,
  loading,
  disabled,
  refreshing,
  onRefresh,
  labelId,
}: {
  tabs: SheetTab[];
  value: number | null;
  onChange: (tab: SheetTab) => void;
  loading: boolean;
  disabled?: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  labelId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (gid: number) => `${listId}-${gid}`;

  const selected = tabs.find((t) => t.gid === value);
  const words = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const { available, used } = useMemo(() => {
    const visible = tabs.filter((t) => {
      const title = tidy(t.title).toLowerCase();
      return words.every((w) => title.includes(w));
    });
    return {
      available: visible.filter((t) => t.status === 'available'),
      used: visible.filter((t) => t.status !== 'available'),
    };
  }, [tabs, words]);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);
  const closeOnOutside = useCallback(() => close(false), [close]);
  useClickOutside(rootRef, open, closeOnOutside);

  function openPicker() {
    setQuery('');
    setActive(
      Math.max(
        0,
        tabs.filter((t) => t.status === 'available').findIndex((t) => t.gid === value),
      ),
    );
    setOpen(true);
  }

  function pick(tab: SheetTab) {
    onChange(tab);
    close(true);
  }

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Keep the keyboard-highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function handleSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    const last = available.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, last));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (available[active]) pick(available[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // close the picker, not the whole dialog
      close(true);
    } else if (e.key === 'Tab') {
      close(false);
    }
  }

  const activeTab = available[active];

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        disabled={disabled || loading}
        onClick={() => (open ? close(false) : openPicker())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openPicker();
          }
        }}
        className={cn(
          'flex min-h-[42px] w-full items-center gap-2 rounded-[10px] border bg-surface px-3 py-2 text-left text-sm outline-none transition-colors',
          'focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-60',
          open ? 'border-brand' : 'border-line-2 hover:border-brand-line',
        )}
      >
        {loading ? (
          <span className="flex flex-1 items-center gap-2 text-faint">
            <RefreshIcon size={14} className="animate-spin" /> Loading tabs…
          </span>
        ) : selected ? (
          <span className="flex-1 truncate text-ink">{tidy(selected.title)}</span>
        ) : (
          <span className="flex-1 text-faint">Choose the event's tab</span>
        )}
        <ChevronDownIcon
          size={16}
          className={cn('shrink-0 text-faint transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="animate-fade-in absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-white shadow-[0_12px_32px_rgba(0,0,0,.12)]">
          <div className="flex items-center gap-2 border-b border-line-3 px-3">
            <SearchIcon size={15} className="shrink-0 text-faint" />
            <input
              ref={searchRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeTab ? optionId(activeTab.gid) : undefined}
              aria-label="Search tabs"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={handleSearchKey}
              placeholder="Search by event or city"
              className="h-11 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
            />
          </div>

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            className="max-h-[300px] overflow-y-auto p-1"
          >
            {available.map((tab, i) => {
              const isSelected = tab.gid === value;
              return (
                <div
                  key={tab.gid}
                  id={optionId(tab.gid)}
                  role="option"
                  aria-selected={isSelected}
                  data-index={i}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()} // keep focus in search
                  onClick={() => pick(tab)}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-sm leading-snug text-ink',
                    i === active && 'bg-brand-tint',
                    isSelected && 'font-semibold',
                  )}
                >
                  <span className="line-clamp-2 flex-1">
                    <Highlight text={tidy(tab.title)} words={words} />
                  </span>
                  {isSelected && (
                    <CheckIcon size={15} className="mt-0.5 shrink-0 text-brand-deep" />
                  )}
                </div>
              );
            })}

            {available.length === 0 && used.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted">
                {query
                  ? `No tabs match “${query.trim()}”.`
                  : 'The Main Sheet has no event tabs yet.'}
              </p>
            )}

            {used.length > 0 && (
              <div role="group" aria-labelledby={`${listId}-used`}>
                <div
                  id={`${listId}-used`}
                  className="px-3 pb-1 pt-3 font-display text-xs font-semibold text-faint"
                >
                  Already have an event
                </div>
                {used.map((tab) => (
                  <div
                    key={tab.gid}
                    role="option"
                    aria-selected={false}
                    aria-disabled="true"
                    className="flex items-start gap-3 rounded-lg px-3 py-2 text-sm leading-snug text-faint"
                  >
                    <span className="line-clamp-2 flex-1">
                      <Highlight text={tidy(tab.title)} words={words} />
                    </span>
                    <span className="mt-px shrink-0 rounded-full border border-line-2 px-2 py-px text-[11px] font-semibold text-muted">
                      {USED_LABEL[tab.status as keyof typeof USED_LABEL]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRefresh}
            disabled={refreshing}
            className="flex w-full items-center gap-2 border-t border-line-3 px-3 py-2.5 text-xs font-semibold text-muted transition-colors hover:text-brand-deep disabled:cursor-wait"
          >
            <RefreshIcon size={13} className={cn(refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing tabs…' : 'Just added a tab? Refresh the list'}
          </button>
        </div>
      )}
    </div>
  );
}
