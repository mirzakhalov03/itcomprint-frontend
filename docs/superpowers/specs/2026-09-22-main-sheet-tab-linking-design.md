# Link events directly from Main Sheet tabs — Design

**Date:** 2026-09-22 (revised 2026-09-23 after review)
**Status:** Approved, pending implementation plan

## Problem

The current sheet-linking flow ([2026-09-15-sheet-sync-design.md](2026-09-15-sheet-sync-design.md))
has three hops:

```
Attendee registers via Telegram bot
  -> bot writes a row to the Main Sheet (all events, one tab each)
  -> operator manually creates a separate per-event spreadsheet and
     copies/points it at that event's data, every time
  -> operator pastes that per-event spreadsheet's URL into "Link Google Sheet"
```

The middle hop is pure manual overhead: the data already lives in the Main
Sheet, one tab per event. The per-event spreadsheet exists only so today's
`LinkSheetDialog` has a URL to paste. This design removes that hop: the
operator picks the event's tab directly out of the Main Sheet from a dropdown
in our app, and both existing event-creation paths (`ImportDialog`'s XLSX
upload and `LinkSheetDialog`'s URL paste) are replaced by this single flow.

## Goals

- Creating an event from a Main Sheet tab requires no manual spreadsheet
  work outside our app — just picking a tab and a date.
- **A tab is linked to at most one event, enforced by the database** — not
  just by the picker UI. Two operators racing, or a stale dialog, can't
  double-link.
- A tab stays reserved while its event is live **or in trash**, and becomes
  available again only once the event is permanently deleted (manually or by
  the 45-day purge). This is what makes restoring a trashed event always safe.
- Renaming a tab after it's linked never breaks sync — tabs are tracked by
  their stable internal ID (gid), not their title.
- A sync failure (tab deleted, access revoked) is **visible on the kiosk**,
  not swallowed by the silent background poll.
- Existing events created under the old per-event-spreadsheet flow keep
  working exactly as they do today. No migration, no dual-write.

## Non-goals

- No filtering of non-event tabs (templates, archives) out of the picker —
  confirmed acceptable for operators to just not select them.
- No attendee-count preview per tab in the picker — title-only, to keep the
  picker fast (one cheap metadata call, no per-tab value reads).
- No support for multiple Main Sheets — one fixed spreadsheet ID for _new_
  events (existing events keep reading whatever `sheetId` they stored).
- Does not touch the bot or how it writes rows into the Main Sheet's tabs.
- No server-side dedupe of syncs when several kiosks show the same event —
  see "Quota" below for why it isn't needed yet.

## Existing pipeline reused, unchanged

Credentials (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`),
the `JWT` client with the **`spreadsheets.readonly`** scope, and the
`Reg. Number` / `Full Name` → `extra` column mapping (`SHEET_COLUMNS`,
`mapSheetRows`) in `backend/src/services/sheetSync.services.ts` are
unchanged — every tab in the Main Sheet follows the same header structure as
today's per-event sheets. The service account stays a **Viewer** on the
Main Sheet.

## Architecture

### Config

New env var, Zod-validated in `config/env.ts` like the rest (fail fast on
missing config):

```ts
MAIN_SHEET_ID: string; // the one fixed Main Sheet spreadsheet ID
```

Because it's required, every environment that boots the server needs it
**before** the code lands: local `backend/.env` (also read by
`npm run smoke`), `scripts/verify.ts`'s in-process env, and Railway.

### Data model changes

`Event` (`backend/src/models/event.model.ts`) — one new optional field and
one index:

```ts
tabGid: number | null;

// One event per Main Sheet tab. Trashed events keep their doc (and so their
// reservation); only a hard delete frees the tab.
eventSchema.index(
  { sheetId: 1, tabGid: 1 },
  {
    unique: true,
    partialFilterExpression: { tabGid: { $type: 'number' } },
    name: 'one_event_per_tab',
  },
);
```

`sheetId` is reused as-is: for new tab-linked events it's `MAIN_SHEET_ID` at
creation time; existing events keep whatever per-event spreadsheet ID they
already have, with `tabGid` staying `null`. `tabGid != null` is the sole
discriminator between the two sync paths — no separate "linkType" field.

The partial filter (`$type: 'number'`) leaves legacy/XLSX events (null
`tabGid`) out of the index entirely, so it builds cleanly on the existing
production collection (Mongoose `autoIndex` is on).

### Listing tabs

New service function in `sheetSync.services.ts`:

```ts
listSheetTabs(sheetId: string): Promise<{ gid: number; title: string }[]>
```

One `spreadsheets.get` call, `fields=sheets.properties(sheetId,title)` —
metadata only, no cell values read. Works with the read-only scope.

New route (lives on the events router — it exists only to feed event
creation):

```
GET /api/events/sheet-tabs
```

Session-guarded like the rest of `/events`. The service calls
`listSheetTabs(MAIN_SHEET_ID)`, then cross-references
`Event.find({ sheetId: MAIN_SHEET_ID, tabGid: { $ne: null } })` — **no
`deletedAt` filter**, so trashed events still reserve their tab. Response:

```ts
{
  gid: number;
  title: string;
  status: 'available' | 'linked' | 'trashed';
}
[];
```

### Reading tab rows (sync)

`syncEventAttendees` branches on the event's `tabGid`:

- **Tab-linked events** (`tabGid` set): `fetchTabRows(event.sheetId, event.tabGid)`
  1. `listSheetTabs(sheetId)` → find the tab whose gid matches.
  2. Not found → throw `AppError(400, TAB_REMOVED_MESSAGE)` (see below).
  3. Found → `values/'<title>'!A:Z` (title single-quoted, inner `'`
     doubled, URL-encoded — handles spaces, apostrophes, Cyrillic).
- **Legacy events** (`tabGid` null): unchanged — `values/A:Z` against
  `event.sheetId`, exactly as today.

It reads from `event.sheetId`, **not** `env.MAIN_SHEET_ID`, so events keep
reading the spreadsheet they were created against even if the Main Sheet is
ever replaced.

`mapSheetRows`, `syncRowsIntoEvent`, and `markRemovedAttendees` are
untouched either way — they operate on already-extracted rows.

**Why not read by gid in one call?** `values.batchGetByDataFilter` accepts a
`GridRange` keyed on gid, but it requires the `spreadsheets` (read-write),
`drive` or `drive.file` scope — it fails with 403 under our
`spreadsheets.readonly` scope, and the verify harness's test bypass would
never catch it. Resolving gid → title with a read-only metadata call is the
scoped-correct way.

**Why not cache the resolved title?** A cached title can silently point at
a _different_ tab: rename tab "DevFest" → "DevFest 2025", then create a new
tab named "DevFest", and the cached read succeeds against the wrong tab —
whose roster `markRemovedAttendees` would then treat as "everyone left".
Re-resolving every tick costs one extra metadata call and makes that
impossible.

### Quota

Google Sheets allows ~60 read requests/min per user per project; the service
account is one user. Each open kiosk screen on a sheet-linked event pulls
every 30 s:

| Event type | Calls per pull | Calls/min per kiosk | Kiosks before the limit |
| ---------- | -------------- | ------------------- | ----------------------- |
| Legacy     | 1              | 2                   | ~30                     |
| Tab-linked | 2              | 4                   | ~15                     |

Real events run a handful of stations, so this is comfortable. If it ever
isn't: request a quota increase in Google Cloud console, or switch to a
single `spreadsheets.get?ranges=…&includeGridData=true` call that returns
the tab's gid alongside its data (verifiable, one call, heavier payload).

### Tab removed after linking

If a tab is deleted from the Main Sheet (not renamed — the gid itself no
longer exists), sync throws a distinct:

```
AppError(400, "This event's tab no longer exists in the Main Sheet — restore it in Google Sheets to resume syncing.")
```

Detection is deterministic (gid absent from the tab list), not based on
matching Google's error text. The roster is left untouched.

The kiosk keeps polling (cheap, and it self-heals if someone restores the
tab via Sheets' version history), but **shows the error persistently** — see
Frontend changes.

## API changes

| Method | Path                 | Purpose                                                            |
| ------ | -------------------- | ------------------------------------------------------------------ |
| GET    | `/events/sheet-tabs` | list Main Sheet tabs with their `status`                           |
| POST   | `/events/sheet`      | **changed** — body becomes `{ name, date, tabGid }`, no `sheetUrl` |

`POST /events/sheet` resolves `sheetId = MAIN_SHEET_ID` server-side, stores
`{ sheetId, tabGid }`, and runs the same initial-sync-with-rollback logic as
before. If the unique index rejects the insert (tab already reserved by a
live or trashed event), it returns **409** with a friendly message. If
`tabGid` doesn't exist in the Main Sheet, the initial sync throws the
tab-removed 400 and the half-created event is rolled back.

`extractSheetId` (URL-regex helper) becomes dead code and is deleted.

`POST /events` (plain "create with an attendees array") is **not** removed
from the backend — it is a generic primitive, not XLSX-specific, and
`backend/scripts/verify.ts` relies on it as a fixture-creation helper for
several unrelated tests (trash, permanent delete, activity log, print flow).
Only the **frontend** path to it is removed: `ImportDialog.tsx`, its
dashboard entry point, and the now-unused client bindings (`useCreateEvent`,
`api.createEvent`, `NewAttendee`) are deleted, and the `xlsx` dependency is
dropped.

## Frontend changes

- `DashboardPage`'s "New event" button no longer opens a two-option chooser
  (`Upload spreadsheet` / `Link Google Sheet`). It opens one new dialog
  directly. `ImportDialog.tsx` and `LinkSheetDialog.tsx` are deleted.
- New dialog `LinkMainSheetTabDialog.tsx`: on open, fetches
  `GET /events/sheet-tabs`, shows a loading state, then renders a native
  `<select>` (styled with `inputBaseClass` + a `ChevronDownIcon` affordance,
  since `appearance-none` removes the native arrow). One `<option>` per tab;
  non-available tabs are `disabled` with a suffix — `(already added)` or
  `(in trash)`. Native `<select>` is deliberate: disabled options are
  built-in.
- Selecting a tab auto-fills the **event name** with the tab title — **only
  if the name is empty or still equals the previous auto-filled title**, so
  switching tabs never clobbers a name the operator typed. **Date** stays a
  manual input.
- Renaming the tab afterward never changes the event's stored name — the
  app only reads the title at selection time.
- Submit sends `{ name, date, tabGid }` to `POST /events/sheet`. On a 409
  the server message is toasted and the tab list refetches, so the
  now-taken tab shows as disabled.
- Tab-list fetch errors render inline under the select; creation errors use
  the existing `errMessage(err, fallback)` + toast pattern.
- **Sync errors on the kiosk**: `useSheetSync` keeps the last background
  pull error (cleared on the next success) and returns it; `AttendeeTable`
  renders it as a persistent `SheetSyncErrorNotice` above the list. Covers
  the tab-removed case and any other failure (revoked access, network) — an
  operator should always know the roster may be stale.
- `EmptyState` copy ("Import a spreadsheet…") is updated to describe the tab
  flow.

## Error handling

- **Main Sheet unreachable** (access revoked, sheet deleted): both Sheets
  calls map failures to the existing friendly
  `AppError(400, "Can't read this Google Sheet — share it with <service-account-email> and try again.")`,
  shared by all Sheets reads via one helper.
- **Tab removed after linking**: distinct deterministic `AppError` above;
  visible on the kiosk via the sync error notice.
- **Tab already reserved**: 409 from the unique index.
- **Legacy events**: no behavior change, no new error paths (they gain the
  kiosk sync-error notice, which only adds visibility).

## Testing

Per project convention (`npm run verify`, no unit tests). Test bypass stubs
the two Sheets HTTP reads (`listSheetTabs`, the values read) — the gid →
title resolution logic runs for real in the harness:

- `tabRange` quotes titles correctly (spaces, apostrophes).
- `GET /events/sheet-tabs` — `available` initially, `linked` after creation,
  still reserved (`trashed`) after trash, `available` after permanent delete.
- `POST /events/sheet` with `tabGid` — stores `sheetId = MAIN_SHEET_ID` +
  `tabGid`, initial sync runs; second create on the same tab → 409; unknown
  gid → 400 and no event left behind; non-numeric `tabGid` → 400.
- Sync: tab-linked event reads via gid → title; **still syncs after the tab
  is renamed**; legacy `sheetId`-only event still uses the `values/A:Z`
  path; removed tab → distinct 400, roster untouched.

## Deployment

Order matters — the server exits on boot without `MAIN_SHEET_ID`:

1. Share the Main Sheet (Viewer) with the existing service account email.
2. Add `MAIN_SHEET_ID` to Railway's backend service variables.
3. Deploy backend, then frontend.

No new infrastructure. The `one_event_per_tab` index auto-builds on boot.

## Open items to confirm during implementation

- Exact option-label wording — cosmetic, decide inline.
- Confirm on the real Main Sheet that tab headers match `SHEET_COLUMNS`
  and data fits within columns A–Z.
