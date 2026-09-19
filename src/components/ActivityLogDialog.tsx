import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useActivity } from '../hooks/useActivity';
import { dayLabel, fmtDateTime, fmtTime } from '../lib/format';
import { errMessage } from '../lib/errors';
import { Dialog } from './ui/Dialog';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { LoadingPanel } from './ui/EmptyState';
import type { ActivityAction, ActivityEntry } from '../types';

const DESCRIBE: Record<ActivityAction, (target: ReactNode) => ReactNode> = {
  'attendee.print': (t) => <>printed {t}’s badge</>,
  'attendee.reprint': (t) => <>reprinted {t}’s badge</>,
  'attendee.unprint': (t) => <>marked {t} as not printed</>,
  'event.create': (t) => <>created event {t}</>,
  'event.update': (t) => <>edited event {t}</>,
  'event.template': (t) => <>switched the template to {t}</>,
  'event.trash': (t) => <>moved {t} to trash</>,
  'event.restore': (t) => <>restored {t}</>,
  'event.delete': (t) => <>permanently deleted {t}</>,
  'template.create': (t) => <>created template {t}</>,
  'template.update': (t) => <>edited template {t}</>,
  'template.delete': (t) => <>deleted template {t}</>,
  'printer.connect': () => <>connected the printer</>,
  'printer.disconnect': () => <>disconnected the printer</>,
};

// Consecutive entries that share a day label; the feed is already newest-first.
function groupByDay(items: ActivityEntry[]) {
  const groups: { label: string; items: ActivityEntry[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function ActivityRow({ entry, showEvent }: { entry: ActivityEntry; showEvent: boolean }) {
  const target = <span className="font-semibold text-ink">{entry.targetName}</span>;
  // Event actions already name the event as their target.
  const eventLine = showEvent && entry.eventName && !entry.action.startsWith('event.');

  return (
    <li className="flex items-center gap-3 py-2.5">
      <Avatar user={{ picture: entry.actorPicture, displayName: entry.actorName || '?' }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-3">
          <span className="font-semibold text-ink">{entry.actorName || 'Someone'}</span>{' '}
          {DESCRIBE[entry.action](target)}
        </p>
        {eventLine && <p className="truncate text-xs text-faint">{entry.eventName}</p>}
      </div>
      <time
        dateTime={entry.createdAt}
        title={fmtDateTime(entry.createdAt)}
        className="shrink-0 text-xs tabular-nums text-faint"
      >
        {fmtTime(entry.createdAt)}
      </time>
    </li>
  );
}

/** Who did what, when — 50 per page, newest first. Event-scoped on the kiosk, global elsewhere. */
export function ActivityLogDialog({ eventId, onClose }: { eventId?: string; onClose: () => void }) {
  // Cursor stack: [null] is the newest page; "Older" pushes the next cursor, "Newer" pops.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const before = cursors[cursors.length - 1];
  const { data, isPending, isError, error, isPlaceholderData, refetch } = useActivity(
    eventId,
    before,
  );
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [before]);

  const nextCursor = data?.nextCursor;
  const page = cursors.length;

  return (
    <Dialog
      size="xl"
      title={eventId ? 'Event activity' : 'Activity log'}
      description={
        eventId
          ? 'Everything done in this event, newest first.'
          : 'Everything done across all events, newest first.'
      }
      onClose={onClose}
    >
      <div
        ref={listRef}
        className={`-mx-5 mt-5 h-[60vh] overflow-y-auto border-y border-line px-5 transition-opacity sm:-mx-7 sm:px-7 ${isPlaceholderData ? 'opacity-60' : ''}`}
      >
        {isPending ? (
          <LoadingPanel>Loading activity…</LoadingPanel>
        ) : isError ? (
          <div className="px-6 py-16 text-center text-sm text-muted">
            {errMessage(error, 'Could not load activity.')}{' '}
            <button onClick={() => refetch()} className="font-semibold text-brand-deep underline">
              Try again
            </button>
          </div>
        ) : data.items.length === 0 ? (
          <LoadingPanel>No activity yet.</LoadingPanel>
        ) : (
          groupByDay(data.items).map((group) => (
            <section key={group.label}>
              <h3 className="sticky top-0 z-10 bg-white pb-1 pt-4 font-display text-[11px] font-semibold uppercase tracking-[.08em] text-faint">
                {group.label}
              </h3>
              <ul className="divide-y divide-line-3">
                {group.items.map((entry) => (
                  <ActivityRow key={entry._id} entry={entry} showEvent={!eventId} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          disabled={page === 1 || isPlaceholderData}
          onClick={() => setCursors((c) => c.slice(0, -1))}
          className="h-9 rounded-lg px-4 text-sm disabled:opacity-40"
        >
          ← Newer
        </Button>
        <span className="font-display text-xs font-semibold text-faint">Page {page}</span>
        <Button
          variant="secondary"
          disabled={!nextCursor || isPlaceholderData}
          onClick={() => nextCursor && setCursors((c) => [...c, nextCursor])}
          className="h-9 rounded-lg px-4 text-sm disabled:opacity-40"
        >
          Older →
        </Button>
      </div>
    </Dialog>
  );
}
