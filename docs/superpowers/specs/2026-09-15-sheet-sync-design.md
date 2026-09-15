# Google Sheet sync for bot-registered / walk-in attendees — Design

**Date:** 2026-09-15
**Status:** Approved, pending implementation plan

## Problem

Attendees currently only enter the system via a one-time XLSX import at event
creation (`createEventWithAttendees`). There is no way for someone who
registers through the Telegram bot close to or during the event (a "walk-in")
to appear on the kiosk roster — the operator would have to notice them
missing and re-import the whole spreadsheet manually.

## Existing upstream pipeline (unchanged by this work)

```
Attendee registers via Telegram bot
  -> bot writes a row to the "Main-Big" spreadsheet (all events, one tab each)
  -> an existing Apps Script trigger on Main-Big fires on new row
  -> it copies the row verbatim (same columns, same order) into a separate
     per-event spreadsheet, created manually 1-2 days before the event
```

This pipeline is not ours and is not modified. The per-event spreadsheet may
already contain rows (pre-registrations) by the time an operator links it in
our platform, or may be empty. Our sync treats "everything currently in the
sheet" as the roster, regardless of when the link is added.

## Goals

- New attendees appearing in a linked per-event sheet show up in the kiosk
  roster within seconds, with no manual re-import.
- Reliable and idempotent: a missed or failed sync attempt self-heals on the
  next one. No delivery guarantees to build or maintain.
- No second codebase to maintain (no Apps Script of our own, no webhook).
- Coexists with the current XLSX import path — this only applies to events
  the operator explicitly links to a Sheet.

## Non-goals

- Do not touch the Main-Big spreadsheet, its Apps Script, or the bot.
- No column-picker UI for sheet-linked events — the per-event sheet's columns
  are fixed and known (verbatim copy of Main-Big's columns).
- No walk-in UI/form in our app — "walk-in support" is entirely satisfied by
  this sync pipeline; nothing else is needed.
- No push/webhook mechanism. Considered and rejected: it requires a second
  maintained codebase (Apps Script), a public authenticated endpoint, and
  Apps Script triggers are known to fail silently under load — which would
  still require a polling reconciliation pass as a safety net, making the
  push path strictly more complex for no reliability gain over pull alone.

## Architecture

### Credentials

One Google Cloud service account for the whole backend. New env vars,
validated at boot by `config/env.ts` the same way existing vars are (fail
fast on missing/invalid config):

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_KEY` (PEM private key; `\n` newlines escaped in the
  env value, unescaped at parse time — the standard pattern for storing a
  multi-line key in a single env var)

The operator shares each per-event Google Sheet with this service account's
email (Viewer) once, the same way they'd share any Google Doc. No OAuth
flow, no per-user credentials.

`google-auth-library` is already a backend dependency (used for verifying
Google ID tokens at login) — it also provides `JWT` / `GoogleAuth` for
service-account auth, so no new auth library dependency is needed. One new
dependency: `googleapis` (or a direct `fetch` against the Sheets API v4 REST
endpoint with a bearer token from `google-auth-library` — decide at
implementation time based on bundle weight; the REST call is trivial enough
that avoiding the full `googleapis` package is worth trying first).

### Data model changes

`Event` (`backend/src/models/event.model.ts`) — three new fields, all
optional/nullable so existing XLSX-created events are unaffected:

```ts
sheetId: string | null; // extracted spreadsheet ID
sheetUrl: string | null; // original pasted URL, kept for display/debugging
lastSyncedAt: Date | null;
```

`Attendee` (`backend/src/models/attendee.model.ts`) — one new field plus one
new index:

```ts
registrantId: string | null;
```

```ts
attendeeSchema.index({ eventId: 1, registrantId: 1 }, { unique: true, sparse: true });
```

`sparse` is required: XLSX-imported attendees have no `registrantId`, and a
non-sparse unique index would collide every one of them against `null`.

### Column mapping

The per-event sheet's header row is fixed and known ahead of time (verbatim
copy of Main-Big). Confirmed header row, in order:

```
Reg. Number | First Name | Last Name | Occupation | Full Name
```

`Reg. Number` and `Full Name` map to the dedicated fields; the rest flow into
`extra` unchanged — including `First Name`/`Last Name`, which duplicate
`Full Name`'s content but stay available in case a badge template zone ever
wants to print just a first name:

```ts
// backend/src/services/sheetSync.services.ts
const SHEET_COLUMNS = {
  registrantId: 'Reg. Number',
  fullName: 'Full Name',
} as const;
```

Every column not listed above (`First Name`, `Last Name`, `Occupation`)
flows into `extra`, keyed by its header text — same shape as XLSX import's
`extra`.

## API changes

| Method | Path                     | Purpose                                                                   |
| ------ | ------------------------ | ------------------------------------------------------------------------- |
| POST   | `/events/sheet`          | create an event **linked to a Google Sheet**; first sync = initial roster |
| POST   | `/events/:id/sync-sheet` | re-read the linked sheet, upsert any new/changed attendees                |

`POST /events` (existing XLSX path) is unchanged. `POST /events/sheet` is the
new sibling entry point — the frontend's "New Event" flow gains a second tab:
"Upload spreadsheet" (existing) vs "Link Google Sheet" (new). Only one of the
two ever applies to a given event; `sheetId` is null for XLSX events, and
XLSX events skip the sync trigger entirely on the frontend.

### `POST /events/sheet`

Body: `{ name, date, sheetUrl }` (no `attendees` array — the sheet
supplies them).

1. Extract the spreadsheet ID from `sheetUrl` (regex on the standard
   `/spreadsheets/d/<ID>/` URL shape); 400 if it doesn't parse.
2. Create the `Event` with `sheetId`/`sheetUrl` set.
3. Immediately run the same sync logic as `POST /events/:id/sync-sheet`
   (below) to populate the initial roster — whatever is currently in the
   sheet, whether that's 0 rows or 200.
4. If the service account can't read the sheet (403/404 from the Sheets
   API), roll back the created event and throw an `AppError(400, ...)` with
   an actionable message: "Share this sheet with
   `<GOOGLE_SERVICE_ACCOUNT_EMAIL>` and try again."

### `POST /events/:id/sync-sheet`

`syncEventAttendees(eventId)`:

1. Load the event; `AppError(400, 'Event is not linked to a sheet')` if
   `sheetId` is null — nothing to sync.
2. `fetchSheetRows(sheetId)` — thin wrapper around the Sheets API
   `values.get`, returns raw rows.
3. Map each row through `SHEET_COLUMNS` into
   `{ registrantId, fullName, extra }`. A row missing `registrantId` or
   `fullName` is skipped and counted, not fatal to the batch.
4. `syncRowsIntoEvent(eventId, mappedRows)` — one `AttendeeModel.bulkWrite`
   of `updateOne({ eventId, registrantId }, { $set: { fullName, extra,
searchText } }, { upsert: true })` per row. New `registrantId`s insert;
   existing ones get refreshed (e.g. the bot corrects a phone number after
   the fact, it flows through on the next sync).
5. Set `event.lastSyncedAt = new Date()`.
6. Return `{ added, updated, skipped, total }`.

`fetchSheetRows` (real Google API call) and `syncRowsIntoEvent` (pure
DB logic) are deliberately separate functions — see Testing below.

## Frontend changes

- **New Event dialog**: add a "Link Google Sheet" tab alongside the existing
  upload tab. Submits to `POST /events/sheet` instead of `POST /events`.
- **`useSheetSync(eventId)`** hook, mounted by `KioskPage` only when the
  loaded event has `sheetId` set: calls `POST /events/:id/sync-sheet` on an
  interval (~7s) via React Query, invalidates `['attendees', eventId]` when
  the response shows `added > 0`.
- **Manual "Sync now" button** in `BadgePrintPanel` or the kiosk toolbar,
  same mutation, always visible for sheet-linked events — gives the operator
  a deliberate way to force a check and get feedback (see Error handling).
- XLSX-imported events never mount `useSheetSync` — zero behavior change for
  them.

## Error handling

- **Background polling failures** (transient Sheets API error, network
  blip) fail silently: log server-side, skip the tick, retry in ~7s. Surfacing
  every transient hiccup as a toast would spam the operator mid-event over
  errors that self-heal on the next poll.
- **Manual "Sync now"** surfaces errors, since it's a deliberate action
  expecting feedback — e.g. "Can't reach the sheet — check it's shared with
  `<service-account-email>`."
- **Row-level bad data** (missing `registrantId`/`fullName`) is skipped and
  counted, never fails the whole sync.
- **`POST /events/sheet` access failure** is the one place we fail loudly
  and synchronously, since the operator is actively waiting on that request.

## Testing

Project convention is no unit tests — `backend/scripts/verify.ts` boots the
real app against an in-memory Mongo and asserts endpoints end-to-end. It
cannot call the real Google Sheets API in CI, so the sync logic is split
along a seam that keeps everything except the actual network call testable:

- `fetchSheetRows(sheetId)` — thin, real API call, not exercised by `verify`.
- `syncRowsIntoEvent(eventId, rows)` — pure mapping + upsert logic, **is**
  exercised by `verify.ts` with fixture row arrays (new attendee, existing
  attendee update, row missing `registrantId`, duplicate `registrantId`
  across two syncs).
- `POST /events/sheet` and `POST /events/:id/sync-sheet` get thin verify
  coverage for the request/response contract and error statuses (400 on
  unlinked event, 400 on unparseable URL), with `fetchSheetRows` stubbed at
  the module boundary so no real network call happens in CI.

## Deployment

- Add `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_KEY` to
  Railway's backend service variables, per `backend/CLAUDE.md`'s existing
  env-var conventions.
- No new infrastructure (no cron, no queue, no second deployable) — sync is
  entirely request-driven from the kiosk page.

## Open items to confirm before/during implementation

- Whether to depend on `googleapis` or hand-roll the REST call via
  `google-auth-library`'s bearer token — decide based on bundle size once in
  the code.
