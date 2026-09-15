# Google Sheet Sync (Walk-in Attendees) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator link an event to a Google Sheet (populated by an existing bot → Apps Script pipeline) so attendees who register on the day of the event appear on the kiosk roster automatically, without a manual re-import.

**Architecture:** Backend polls the linked per-event Google Sheet on request (no cron, no webhook) via a service account, upserting attendees by a stable `registrantId`. The Kiosk page drives the poll cadence by calling a sync endpoint every ~7s while open, plus a manual "Sync now" button. XLSX import is untouched and remains the path for events with no bot involvement.

**Tech Stack:** Express 5 / Mongoose 9 / Zod 4 (backend), `google-auth-library` (already a dependency, used here for service-account JWT auth to the Sheets REST API — no new dependency). React 19 / React Query (frontend).

**Spec:** `docs/superpowers/specs/2026-09-15-sheet-sync-design.md`

## Global Constraints

- Column mapping is fixed and hardcoded: `Reg. Number` → `registrantId`, `Full Name` → `fullName`; every other header (`First Name`, `Last Name`, `Occupation`, and any future column) flows into `extra` keyed by its header text.
- No new npm dependency for the Sheets API call — use `google-auth-library`'s `JWT` client's `.request()` against the Sheets REST API directly.
- Background/polling sync failures fail silently (log only); only the manual "Sync now" action and the initial `POST /events/sheet` surface errors to the operator.
- `registrantId` is optional/sparse on `Attendee` — XLSX-imported attendees have none, and must not collide against the unique index.
- No changes to `POST /events` (XLSX path), the Main-Big spreadsheet, or any Apps Script — those are out of scope entirely.
- Backend test convention: no unit test framework. Extend `backend/scripts/verify.ts` only — it boots the real app against an in-memory Mongo and checks against a running HTTP server (and can also directly import pure functions from services for non-HTTP checks).

---

## Task 1: Config — Google service account env vars

**Files:**

- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Modify: `backend/scripts/verify.ts` (env bootstrap block, ~line 24)

**Interfaces:**

- Produces: `env.GOOGLE_SERVICE_ACCOUNT_EMAIL: string`, `env.GOOGLE_SERVICE_ACCOUNT_KEY: string` — consumed by Task 4's Sheets client.

- [ ] **Step 1: Add the two fields to the env schema**

In `backend/src/config/env.ts`, add to `envSchema` (after `JWT_SECRET`):

```ts
GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().min(1, 'GOOGLE_SERVICE_ACCOUNT_EMAIL is required'),
GOOGLE_SERVICE_ACCOUNT_KEY: z.string().min(1, 'GOOGLE_SERVICE_ACCOUNT_KEY is required'),
```

- [ ] **Step 2: Document the new vars in `.env.example`**

Append to `backend/.env.example`:

```
# Service account used to read operators' linked Google Sheets (Sheets API,
# readonly). Share each per-event sheet with this email as Viewer.
GOOGLE_SERVICE_ACCOUNT_EMAIL=sheet-sync@your-project.iam.gserviceaccount.com
# PEM private key from the service account's JSON key file. Keep \n escaped
# on one line, e.g. "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
GOOGLE_SERVICE_ACCOUNT_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

- [ ] **Step 3: Add fake values to the verify harness**

In `backend/scripts/verify.ts`, in the block that sets `process.env` before importing `createApp` (next to the existing `GOOGLE_CLIENT_ID`/`JWT_SECRET` lines), add:

```ts
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test-sheet-sync@example.iam.gserviceaccount.com';
process.env.GOOGLE_SERVICE_ACCOUNT_KEY =
  'test-key-unused-because-fetchSheetRows-is-stubbed-in-test-mode';
```

- [ ] **Step 4: Verify the app still boots**

Run: `cd backend && npm run verify`
Expected: all existing checks still pass (env now requires two more vars, both supplied). If it fails with a Zod config error, confirm the exact field names match Step 1.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/config/env.ts .env.example scripts/verify.ts
git commit -m "feat(config): add Google service account env vars for sheet sync"
```

---

## Task 2: Data model — Event and Attendee fields

**Files:**

- Modify: `backend/src/models/event.model.ts`
- Modify: `backend/src/models/attendee.model.ts`

**Interfaces:**

- Produces: `EventDoc.sheetId: string | null`, `EventDoc.sheetUrl: string | null`, `EventDoc.lastSyncedAt: Date | null`; `AttendeeDoc.registrantId: string | null`; compound sparse-unique index `{ eventId: 1, registrantId: 1 }`.

- [ ] **Step 1: Add fields to `EventDoc` and the schema**

In `backend/src/models/event.model.ts`, add to the interface:

```ts
sheetId: string | null;
sheetUrl: string | null;
lastSyncedAt: Date | null;
```

And to `eventSchema`:

```ts
sheetId: { type: String, default: null },
sheetUrl: { type: String, default: null },
lastSyncedAt: { type: Date, default: null },
```

- [ ] **Step 2: Add `registrantId` to `AttendeeDoc` and the schema**

In `backend/src/models/attendee.model.ts`, add to the interface:

```ts
registrantId: string | null;
```

And to `attendeeSchema`:

```ts
registrantId: { type: String, default: null },
```

After the existing `attendeeSchema.index({ eventId: 1, searchText: 1 })` line, add:

```ts
// sparse: XLSX-imported attendees have no registrantId and must not collide
// against each other under a non-sparse unique index.
attendeeSchema.index({ eventId: 1, registrantId: 1 }, { unique: true, sparse: true });
```

- [ ] **Step 3: Run verify to confirm no regressions**

Run: `cd backend && npm run verify`
Expected: `ALL PASSED` with the same count as before (49 passed) — these are additive, optional fields.

- [ ] **Step 4: Commit**

```bash
cd backend
git add src/models/event.model.ts src/models/attendee.model.ts
git commit -m "feat(models): add sheet-linking fields to Event and Attendee"
```

---

## Task 3: `sheetSync.services.ts` — column mapping (pure, testable)

**Files:**

- Create: `backend/src/services/sheetSync.services.ts`
- Modify: `backend/scripts/verify.ts`

**Interfaces:**

- Produces: `extractSheetId(url: string): string | null`; `SHEET_COLUMNS: { registrantId: 'Reg. Number'; fullName: 'Full Name' }`; `interface MappedRow { registrantId: string; fullName: string; extra: Record<string, string> }`; `mapSheetRows(rows: string[][]): { mapped: MappedRow[]; skipped: number }`.
- Consumes: none (pure, no DB, no network).

- [ ] **Step 1: Write `extractSheetId` and `mapSheetRows`**

Create `backend/src/services/sheetSync.services.ts`:

```ts
export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export const SHEET_COLUMNS = {
  registrantId: 'Reg. Number',
  fullName: 'Full Name',
} as const;

export interface MappedRow {
  registrantId: string;
  fullName: string;
  extra: Record<string, string>;
}

/**
 * Maps raw Sheets API rows (first row = header) into attendee shape.
 * A row missing registrantId or fullName is skipped, not fatal.
 */
export function mapSheetRows(rows: string[][]): { mapped: MappedRow[]; skipped: number } {
  if (rows.length === 0) return { mapped: [], skipped: 0 };
  const [header, ...dataRows] = rows;
  const regIdx = header.indexOf(SHEET_COLUMNS.registrantId);
  const nameIdx = header.indexOf(SHEET_COLUMNS.fullName);
  if (regIdx === -1 || nameIdx === -1) {
    return { mapped: [], skipped: dataRows.length };
  }

  let skipped = 0;
  const mapped: MappedRow[] = [];
  for (const row of dataRows) {
    const registrantId = (row[regIdx] ?? '').trim();
    const fullName = (row[nameIdx] ?? '').trim();
    if (!registrantId || !fullName) {
      skipped++;
      continue;
    }
    const extra: Record<string, string> = {};
    header.forEach((col, i) => {
      if (i === regIdx || i === nameIdx) return;
      const value = (row[i] ?? '').trim();
      if (value) extra[col] = value;
    });
    mapped.push({ registrantId, fullName, extra });
  }
  return { mapped, skipped };
}
```

- [ ] **Step 2: Add direct-import checks to verify.ts**

`verify.ts` imports real app modules after setting env — this pure function needs no HTTP server or DB, so test it with a direct import + `check()`, right after the existing `import` block (before `main()`'s try block, or as its own small function called at the top of `main()`). Add near the top of `main()`, right after the dynamic imports:

```ts
const { extractSheetId, mapSheetRows } = await import('../src/services/sheetSync.services');

check(
  'extractSheetId parses a standard Sheets URL',
  extractSheetId('https://docs.google.com/spreadsheets/d/abc123XYZ/edit#gid=0') === 'abc123XYZ',
);
check(
  'extractSheetId returns null for a non-Sheets URL',
  extractSheetId('https://example.com') === null,
);

const mapResult = mapSheetRows([
  ['Reg. Number', 'First Name', 'Last Name', 'Occupation', 'Full Name'],
  ['R1', 'Jane', 'Doe', 'Engineer', 'Jane Doe'],
  ['', 'No', 'Reg', 'Id', 'No Reg Id'], // missing registrantId → skipped
  ['R2', 'John', '', '', 'John Smith'],
]);
check('mapSheetRows maps 2 valid rows', mapResult.mapped.length === 2, mapResult);
check('mapSheetRows skips 1 row missing registrantId', mapResult.skipped === 1, mapResult);
check(
  'mapSheetRows puts Occupation into extra',
  mapResult.mapped[0].extra.Occupation === 'Engineer',
  mapResult.mapped[0],
);
check(
  'mapSheetRows omits empty extra values',
  !('Last Name' in mapResult.mapped[1].extra),
  mapResult.mapped[1],
);
```

- [ ] **Step 3: Run verify and confirm the new checks pass**

Run: `cd backend && npm run verify`
Expected: the 6 new checks above all show `✓`, total pass count increases by 6, `ALL PASSED`.

- [ ] **Step 4: Commit**

```bash
cd backend
git add src/services/sheetSync.services.ts scripts/verify.ts
git commit -m "feat(sheet-sync): pure column mapping for sheet rows"
```

---

## Task 4: `sheetSync.services.ts` — Sheets API client + test bypass

**Files:**

- Modify: `backend/src/services/sheetSync.services.ts`
- Modify: `backend/scripts/verify.ts`

**Interfaces:**

- Consumes: `env.GOOGLE_SERVICE_ACCOUNT_EMAIL`, `env.GOOGLE_SERVICE_ACCOUNT_KEY`, `isTest` from `../config/env`; `AppError` from `../utils/AppError`.
- Produces: `fetchSheetRows(sheetId: string): Promise<string[][]>`; `__setTestSheetRows(sheetId: string, rows: string[][]): void` (test-only, throws outside `isTest`).

- [ ] **Step 1: Add the JWT client and `fetchSheetRows`**

Append to `backend/src/services/sheetSync.services.ts`:

```ts
import { JWT } from 'google-auth-library';
import { env, isTest } from '../config/env';
import { AppError } from '../utils/AppError';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

let jwtClient: JWT | null = null;
function getJwtClient(): JWT {
  if (!jwtClient) {
    jwtClient = new JWT({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n'),
      scopes: [SHEETS_SCOPE],
    });
  }
  return jwtClient;
}

/**
 * TEST BYPASS: when NODE_ENV=test, rows come from an in-memory fixture set
 * via __setTestSheetRows instead of a real Sheets API call — mirrors the
 * test|{...} bypass pattern in auth.services.ts. isTest is false outside
 * the verify harness, so this branch is dead code in dev/prod.
 */
const testRowsBySheetId = new Map<string, string[][]>();

export function __setTestSheetRows(sheetId: string, rows: string[][]): void {
  if (!isTest) throw new Error('__setTestSheetRows is test-only');
  testRowsBySheetId.set(sheetId, rows);
}

export async function fetchSheetRows(sheetId: string): Promise<string[][]> {
  if (isTest) {
    return testRowsBySheetId.get(sheetId) ?? [];
  }
  const client = getJwtClient();
  try {
    const res = await client.request<{ values?: string[][] }>({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:Z`,
    });
    return res.data.values ?? [];
  } catch {
    throw new AppError(
      400,
      `Can't read this Google Sheet — share it with ${env.GOOGLE_SERVICE_ACCOUNT_EMAIL} and try again.`,
    );
  }
}
```

- [ ] **Step 2: Add verify checks for the test bypass**

Add to `verify.ts`, after the Task 3 checks:

```ts
const { fetchSheetRows, __setTestSheetRows } = await import('../src/services/sheetSync.services');

check(
  'fetchSheetRows returns [] for an unset sheetId',
  (await fetchSheetRows('unset-sheet')).length === 0,
);

__setTestSheetRows('fixture-sheet-1', [
  ['Reg. Number', 'First Name', 'Last Name', 'Occupation', 'Full Name'],
  ['R1', 'Jane', 'Doe', 'Engineer', 'Jane Doe'],
]);
const fixtureRows = await fetchSheetRows('fixture-sheet-1');
check(
  'fetchSheetRows returns the fixture rows set for a sheetId',
  fixtureRows.length === 2,
  fixtureRows,
);
```

- [ ] **Step 3: Run verify**

Run: `cd backend && npm run verify`
Expected: the 2 new checks pass, no real network call is made (test env never reaches the `else` branch).

- [ ] **Step 4: Commit**

```bash
cd backend
git add src/services/sheetSync.services.ts scripts/verify.ts
git commit -m "feat(sheet-sync): Sheets API client with test-mode bypass"
```

---

## Task 5: `sheetSync.services.ts` — upsert + orchestration

**Files:**

- Modify: `backend/src/services/sheetSync.services.ts`
- Modify: `backend/scripts/verify.ts`

**Interfaces:**

- Consumes: `AttendeeModel` from `../models/attendee.model`, `EventModel` from `../models/event.model`, `buildSearchText` (currently private to `event.services.ts` — export it from there; see Step 1).
- Produces: `syncRowsIntoEvent(eventId: string, rows: MappedRow[]): Promise<{ added: number; updated: number }>`; `syncEventAttendees(eventId: string): Promise<{ added: number; updated: number; skipped: number; total: number }>`.

- [ ] **Step 1: Export `buildSearchText` from `event.services.ts`**

In `backend/src/services/event.services.ts`, change:

```ts
function buildSearchText(fullName: string, extra: Record<string, string>): string {
```

to:

```ts
export function buildSearchText(fullName: string, extra: Record<string, string>): string {
```

(No other change to that file in this task — call sites inside it are unaffected.)

- [ ] **Step 2: Write `syncRowsIntoEvent`**

Append to `backend/src/services/sheetSync.services.ts`:

```ts
import { AttendeeModel } from '../models/attendee.model';
import { EventModel } from '../models/event.model';
import { buildSearchText } from './event.services';

export async function syncRowsIntoEvent(
  eventId: string,
  rows: MappedRow[],
): Promise<{ added: number; updated: number }> {
  if (rows.length === 0) return { added: 0, updated: 0 };

  const result = await AttendeeModel.bulkWrite(
    rows.map((row) => ({
      updateOne: {
        filter: { eventId, registrantId: row.registrantId },
        update: {
          $set: {
            eventId,
            registrantId: row.registrantId,
            fullName: row.fullName,
            extra: row.extra,
            searchText: buildSearchText(row.fullName, row.extra),
          },
        },
        upsert: true,
      },
    })),
  );

  return { added: result.upsertedCount, updated: result.modifiedCount };
}
```

- [ ] **Step 3: Write `syncEventAttendees`**

Append to `backend/src/services/sheetSync.services.ts`:

```ts
export async function syncEventAttendees(
  eventId: string,
): Promise<{ added: number; updated: number; skipped: number; total: number }> {
  const event = await EventModel.findById(eventId);
  if (!event) throw new AppError(404, 'Event not found');
  if (!event.sheetId) throw new AppError(400, 'Event is not linked to a sheet');

  const rows = await fetchSheetRows(event.sheetId);
  const { mapped, skipped } = mapSheetRows(rows);
  const { added, updated } = await syncRowsIntoEvent(eventId, mapped);

  event.lastSyncedAt = new Date();
  await event.save();

  return { added, updated, skipped, total: mapped.length + skipped };
}
```

- [ ] **Step 4: Add verify checks**

Add to `verify.ts`, after Task 4's checks — this exercises insert-then-update and the "not linked" error path directly (no HTTP needed, since `EventModel`/`AttendeeModel` are already imported by the running app; import them fresh here too):

```ts
const { syncRowsIntoEvent, syncEventAttendees } =
  await import('../src/services/sheetSync.services');
const { EventModel: SyncEventModel } = await import('../src/models/event.model');
const { AttendeeModel: SyncAttendeeModel } = await import('../src/models/attendee.model');

const syncEvent = await SyncEventModel.create({
  name: 'Sync Test Event',
  date: new Date(),
  authorId: new mongoose.Types.ObjectId(),
  sheetId: 'fixture-sheet-2',
});

check(
  'syncEventAttendees → 400 when event has no sheetId',
  await SyncEventModel.create({
    name: 'No Sheet',
    date: new Date(),
    authorId: new mongoose.Types.ObjectId(),
  })
    .then((e) => syncEventAttendees(String(e._id)))
    .then(
      () => false,
      (err) => err.status === 400,
    ),
);

__setTestSheetRows('fixture-sheet-2', [
  ['Reg. Number', 'First Name', 'Last Name', 'Occupation', 'Full Name'],
  ['R1', 'Jane', 'Doe', 'Engineer', 'Jane Doe'],
]);
const firstSync = await syncEventAttendees(String(syncEvent._id));
check(
  'first sync → 1 added, 0 updated',
  firstSync.added === 1 && firstSync.updated === 0,
  firstSync,
);

__setTestSheetRows('fixture-sheet-2', [
  ['Reg. Number', 'First Name', 'Last Name', 'Occupation', 'Full Name'],
  ['R1', 'Jane', 'Doe', 'Senior Engineer', 'Jane Doe'], // Occupation changed
  ['R2', 'John', 'Smith', '', 'John Smith'], // new registrant (walk-in)
]);
const secondSync = await syncEventAttendees(String(syncEvent._id));
check(
  'second sync → 1 added (walk-in), 1 updated (changed)',
  secondSync.added === 1 && secondSync.updated === 1,
  secondSync,
);

const attendeesAfterSync = await SyncAttendeeModel.find({ eventId: syncEvent._id }).lean();
check(
  'event now has 2 attendees total',
  attendeesAfterSync.length === 2,
  attendeesAfterSync.length,
);
check(
  "Jane's occupation was updated in place, not duplicated",
  attendeesAfterSync.find((a) => a.registrantId === 'R1')?.extra.Occupation === 'Senior Engineer',
  attendeesAfterSync.find((a) => a.registrantId === 'R1'),
);
```

- [ ] **Step 5: Run verify**

Run: `cd backend && npm run verify`
Expected: all new checks pass; total should now be roughly 49 + 6 (Task 3) + 2 (Task 4) + 5 (this task) = 62 passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/services/sheetSync.services.ts src/services/event.services.ts scripts/verify.ts
git commit -m "feat(sheet-sync): upsert attendees from sheet rows, orchestrate full sync"
```

---

## Task 6: Event creation from a Sheet + API surface

**Files:**

- Modify: `backend/src/services/event.services.ts`
- Modify: `backend/src/validators/event.validators.ts`
- Modify: `backend/src/controllers/event.controllers.ts`
- Modify: `backend/src/routes/event.routes.ts`
- Modify: `backend/scripts/verify.ts`

**Interfaces:**

- Consumes: `extractSheetId`, `syncEventAttendees` from `./sheetSync.services`.
- Produces: `createEventFromSheet(input: CreateEventFromSheetInput, author): Promise<...>`; routes `POST /events/sheet`, `POST /events/:id/sync-sheet`.

- [ ] **Step 1: Add the validator**

In `backend/src/validators/event.validators.ts`, add:

```ts
export const createEventFromSheetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  date: z.iso.datetime({ offset: true }).or(z.iso.date()),
  sheetUrl: z.string().url(),
});

export type CreateEventFromSheetInput = z.infer<typeof createEventFromSheetSchema>;
```

- [ ] **Step 2: Add `createEventFromSheet` to `event.services.ts`**

In `backend/src/services/event.services.ts`, add the import and function:

```ts
import { extractSheetId, syncEventAttendees } from './sheetSync.services';
import { CreateEventFromSheetInput } from '../validators/event.validators';

export async function createEventFromSheet(
  input: CreateEventFromSheetInput,
  author: { id: string; name: string; picture: string },
) {
  const sheetId = extractSheetId(input.sheetUrl);
  if (!sheetId) throw new AppError(400, 'Could not find a Google Sheet ID in that URL');

  const event = await EventModel.create({
    name: input.name,
    date: new Date(input.date),
    authorId: author.id,
    authorName: author.name,
    authorPicture: author.picture,
    sheetId,
    sheetUrl: input.sheetUrl,
  });

  try {
    const result = await syncEventAttendees(String(event._id));
    return { ...event.toObject(), attendeeCount: result.total - result.skipped, ...result };
  } catch (err) {
    await EventModel.findByIdAndDelete(event._id);
    throw err;
  }
}

export async function syncEventSheet(eventId: string) {
  return syncEventAttendees(eventId);
}
```

- [ ] **Step 3: Add controllers**

In `backend/src/controllers/event.controllers.ts`, add:

```ts
export async function createFromSheet(req: Request, res: Response) {
  const user = req.user!;
  const event = await eventService.createEventFromSheet(req.body, {
    id: String(user._id),
    name: user.displayName,
    picture: user.picture,
  });
  res.status(201).json(event);
}

export async function syncSheet(req: Request, res: Response) {
  const result = await eventService.syncEventSheet(String(req.params.id));
  res.json(result);
}
```

- [ ] **Step 4: Wire the routes**

In `backend/src/routes/event.routes.ts`, update the import and add routes:

```ts
import {
  createEventSchema,
  createEventFromSheetSchema,
  eventIdParamSchema,
  setEventTemplateSchema,
} from '../validators/event.validators';
```

```ts
eventRouter.post('/sheet', validate(createEventFromSheetSchema), controller.createFromSheet);
eventRouter.post('/:id/sync-sheet', validate(eventIdParamSchema, 'params'), controller.syncSheet);
```

Place `/sheet` **before** `/:id/sync-sheet` and after `POST /` — Express matches `/sheet` as a literal before `/:id/...` only if declared first, so keep this ordering.

- [ ] **Step 5: Add verify checks over HTTP**

Add to `verify.ts`, in the events section (after the existing event checks), using the already-authenticated `afetch` helper:

```ts
__setTestSheetRows('fixture-sheet-3', [
  ['Reg. Number', 'First Name', 'Last Name', 'Occupation', 'Full Name'],
  ['R1', 'Alice', 'Lee', 'Designer', 'Alice Lee'],
]);
const createSheetEventRes = await afetch('/events/sheet', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Bot Event',
    date: '2026-10-01',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/fixture-sheet-3/edit',
  }),
});
const sheetEvent = await createSheetEventRes.json();
check('POST /events/sheet → 201', createSheetEventRes.status === 201, sheetEvent);
check('POST /events/sheet → initial roster of 1', sheetEvent.added === 1, sheetEvent);

__setTestSheetRows('fixture-sheet-3', [
  ['Reg. Number', 'First Name', 'Last Name', 'Occupation', 'Full Name'],
  ['R1', 'Alice', 'Lee', 'Designer', 'Alice Lee'],
  ['R2', 'Bob', 'Kim', 'PM', 'Bob Kim'], // walk-in registers mid-event
]);
const syncRes = await afetch(`/events/${sheetEvent._id}/sync-sheet`, { method: 'POST' });
const syncBody = await syncRes.json();
check('POST /events/:id/sync-sheet → picks up the walk-in', syncBody.added === 1, syncBody);

const notLinkedEvents = await afetch('/events').then((r) => r.json());
const xlsxEvent = notLinkedEvents.find((e: { sheetId: string | null }) => !e.sheetId);
const badSyncRes = await afetch(`/events/${xlsxEvent._id}/sync-sheet`, { method: 'POST' });
check(
  'POST /events/:id/sync-sheet on an XLSX event → 400',
  badSyncRes.status === 400,
  badSyncRes.status,
);

const badUrlRes = await afetch('/events/sheet', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Bad',
    date: '2026-10-01',
    sheetUrl: 'https://example.com/not-a-sheet',
  }),
});
check('POST /events/sheet with unparseable URL → 400', badUrlRes.status === 400, badUrlRes.status);
```

- [ ] **Step 6: Run verify**

Run: `cd backend && npm run verify`
Expected: `ALL PASSED`, count now includes these 5 new checks. Fix any route-ordering or validator issues if `/sheet` gets swallowed by `/:id`.

- [ ] **Step 7: Commit**

```bash
cd backend
git add src/services/event.services.ts src/validators/event.validators.ts src/controllers/event.controllers.ts src/routes/event.routes.ts scripts/verify.ts
git commit -m "feat(events): add sheet-linked event creation and sync endpoints"
```

---

## Task 7: Frontend types + API client

**Files:**

- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**

- Produces: `AppEvent.sheetId: string | null`, `AppEvent.sheetUrl: string | null`, `AppEvent.lastSyncedAt: string | null`; `interface SheetSyncResult { added: number; updated: number; skipped: number; total?: number }`; `api.createEventFromSheet(payload): Promise<AppEvent>`; `api.syncEventSheet(eventId): Promise<SheetSyncResult>`.

- [ ] **Step 1: Extend `AppEvent` and add `SheetSyncResult`**

In `frontend/src/types.ts`, add to `AppEvent`:

```ts
sheetId: string | null;
sheetUrl: string | null;
lastSyncedAt: string | null;
```

And add a new exported type:

```ts
export interface SheetSyncResult {
  added: number;
  updated: number;
  skipped: number;
  total?: number;
}
```

- [ ] **Step 2: Add API methods**

In `frontend/src/lib/api.ts`, add to the `api` object (near `createEvent`):

```ts
createEventFromSheet: (payload: { name: string; date: string; sheetUrl: string }) =>
  request<AppEvent & SheetSyncResult>('/events/sheet', { method: 'POST', body: JSON.stringify(payload) }),

syncEventSheet: (eventId: string) =>
  request<SheetSyncResult>(`/events/${eventId}/sync-sheet`, { method: 'POST' }),
```

Add `SheetSyncResult` to the `import type` list at the top of the file.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/types.ts src/lib/api.ts
git commit -m "feat(api): add sheet-linked event creation and sync client methods"
```

---

## Task 8: `useSheetSync` hook + `useCreateEventFromSheet`

**Files:**

- Modify: `frontend/src/hooks/useEvents.ts`
- Create: `frontend/src/hooks/useSheetSync.ts`

**Interfaces:**

- Consumes: `api.createEventFromSheet`, `api.syncEventSheet` from Task 7.
- Produces: `useCreateEventFromSheet(): UseMutationResult<...>`; `useSheetSync(eventId: string | null, enabled: boolean): { syncNow: () => void; isSyncing: boolean }`.

- [ ] **Step 1: Add `useCreateEventFromSheet`**

In `frontend/src/hooks/useEvents.ts`, add:

```ts
export function useCreateEventFromSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; date: string; sheetUrl: string }) =>
      api.createEventFromSheet(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}
```

- [ ] **Step 2: Write `useSheetSync`**

Create `frontend/src/hooks/useSheetSync.ts`:

```ts
import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';

const POLL_INTERVAL_MS = 7000;

/**
 * Polls a sheet-linked event's roster while `enabled` (the Kiosk page is
 * open for that event). Background ticks are silent on failure — a flaky
 * Sheets API call self-heals on the next tick. Only the manual syncNow()
 * call (per-call onError, not the mutation's own) surfaces a toast, since
 * that's a deliberate action expecting feedback.
 */
export function useSheetSync(eventId: string | null, enabled: boolean) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.syncEventSheet(eventId!),
    onSuccess: (result) => {
      if (result.added > 0) qc.invalidateQueries({ queryKey: ['attendees', eventId] });
      qc.invalidateQueries({ queryKey: ['events'] }); // refresh lastSyncedAt display
    },
  });
  const mutateRef = useRef(mutation.mutate);
  mutateRef.current = mutation.mutate;

  useEffect(() => {
    if (!enabled || !eventId) return;
    mutateRef.current(); // silent — no onError, background tick self-heals next round
    const id = setInterval(() => mutateRef.current(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, eventId]);

  return {
    syncNow: () =>
      mutation.mutate(undefined, {
        onError: (err) => toast(errMessage(err, "Couldn't sync the sheet — try again.")),
      }),
    isSyncing: mutation.isPending,
  };
}
```

The background `useEffect` tick and the manual `syncNow()` share the same underlying mutation (so `isSyncing` reflects either), but only `syncNow()` attaches a per-call `onError` — TanStack Query v5 supports per-call callbacks alongside the mutation's own `onSuccess`, so this needs no second mutation instance.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/hooks/useEvents.ts src/hooks/useSheetSync.ts
git commit -m "feat(hooks): add useSheetSync polling hook and useCreateEventFromSheet"
```

---

## Task 9: "Link Google Sheet" dialog + New Event chooser

**Files:**

- Create: `frontend/src/components/LinkSheetDialog.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`

**Interfaces:**

- Consumes: `useCreateEventFromSheet` from Task 8.
- Produces: `LinkSheetDialog` component with the same `{ onClose, onImported }` prop shape as `ImportDialog`, so `DashboardPage` can swap between them.

- [ ] **Step 1: Write `LinkSheetDialog`**

Create `frontend/src/components/LinkSheetDialog.tsx`, modeled directly on `ImportDialog.tsx`'s structure and styling (same modal shell, button classes, `Input` usage) but with a URL field instead of a file picker:

```tsx
import { useState } from 'react';
import { useCreateEventFromSheet } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import type { AppEvent } from '../types';

export function LinkSheetDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: (event: AppEvent) => void;
}) {
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [sheetUrl, setSheetUrl] = useState('');
  const createFromSheet = useCreateEventFromSheet();

  const canCreate = !!eventName.trim() && !!sheetUrl.trim();

  async function handleCreate() {
    try {
      const created = await createFromSheet.mutateAsync({
        name: eventName.trim(),
        date: eventDate,
        sheetUrl: sheetUrl.trim(),
      });
      toast(`Event linked — ${created.added} attendee(s) synced`);
      if (onImported) onImported(created);
      else onClose();
    } catch (err) {
      toast(errMessage(err, "Couldn't link that sheet — try again."));
    }
  }

  return (
    <div
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/55 p-4 backdrop-blur-[4px] sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-dlg-in my-auto w-full max-w-[520px] rounded-2xl bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,.3)] sm:p-7"
      >
        <div className="font-display text-xl font-bold text-ink">Link a Google Sheet</div>
        <div className="mt-1 text-sm text-muted">
          The roster syncs automatically from this sheet — new registrants appear on the kiosk
          within seconds.
        </div>

        <div className="mt-[18px] grid grid-cols-2 gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-xs font-semibold text-ink-3">Event name</span>
            <Input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g. DevFest Tashkent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-xs font-semibold text-ink-3">Event date</span>
            <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </label>
        </div>

        <label className="mt-3.5 flex flex-col gap-1.5">
          <span className="font-display text-xs font-semibold text-ink-3">Google Sheet link</span>
          <Input
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
          />
        </label>

        <div className="mt-2.5 text-xs text-faint">
          Make sure this sheet is shared (Viewer) with the sync service account first.
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <Button
            variant="secondary"
            onClick={onClose}
            className="h-11 rounded-[10px] px-5 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!canCreate || createFromSheet.isPending}
            className="h-11 rounded-[10px] px-6 text-sm"
          >
            {createFromSheet.isPending ? 'Linking…' : 'Link sheet'}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire a source chooser into `DashboardPage`**

In `frontend/src/pages/DashboardPage.tsx`, replace the single `ImportDialog` lazy import and `importing` boolean with two dialogs and a small chooser. Replace the top of the file:

```tsx
import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEvents } from '../hooks/useEvents';
import { EventCard } from '../components/EventCard';
import { UploadIcon, ChevronDownIcon } from '../components/icons';
import { Button } from '../components/ui/Button';
import { EmptyState, LoadingPanel } from '../components/ui/EmptyState';
import type { AppEvent } from '../types';

const ImportDialog = lazy(() =>
  import('../components/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);
const LinkSheetDialog = lazy(() =>
  import('../components/LinkSheetDialog').then((m) => ({ default: m.LinkSheetDialog })),
);

type NewEventMode = 'closed' | 'upload' | 'sheet';
```

Replace the `const [importing, setImporting] = useState(false);` line and the "New event" button block with:

```tsx
const [mode, setMode] = useState<NewEventMode>('closed');
const [chooserOpen, setChooserOpen] = useState(false);
```

```tsx
<div className="relative">
  <Button
    onClick={() => setChooserOpen((v) => !v)}
    className="h-11 gap-2 rounded-full px-[18px] text-sm"
  >
    <UploadIcon size={16} /> New event <ChevronDownIcon size={14} />
  </Button>
  {chooserOpen && (
    <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
      <button
        onClick={() => {
          setChooserOpen(false);
          setMode('upload');
        }}
        className="block w-full px-4 py-3 text-left text-sm text-ink hover:bg-surface"
      >
        Upload spreadsheet
      </button>
      <button
        onClick={() => {
          setChooserOpen(false);
          setMode('sheet');
        }}
        className="block w-full px-4 py-3 text-left text-sm text-ink hover:bg-surface"
      >
        Link Google Sheet
      </button>
    </div>
  )}
</div>
```

And replace the final `{importing && (...)}` block with:

```tsx
{
  mode === 'upload' && (
    <Suspense fallback={null}>
      <ImportDialog
        onClose={() => setMode('closed')}
        onImported={(event: AppEvent) => {
          setMode('closed');
          navigate(`/app/events/${event._id}`);
        }}
      />
    </Suspense>
  );
}
{
  mode === 'sheet' && (
    <Suspense fallback={null}>
      <LinkSheetDialog
        onClose={() => setMode('closed')}
        onImported={(event: AppEvent) => {
          setMode('closed');
          navigate(`/app/events/${event._id}`);
        }}
      />
    </Suspense>
  );
}
```

- [ ] **Step 3: Manual browser check**

Run: `cd frontend && npm run dev`, open the dashboard, click "New event" — confirm the two-option dropdown appears, "Upload spreadsheet" opens the existing dialog unchanged, "Link Google Sheet" opens the new one. (A real sheet link can't be tested end-to-end without a live service account yet — that's covered by Task 6's backend verify coverage and Task 10's manual test plan.)

- [ ] **Step 4: Typecheck and lint**

Run: `cd frontend && npx tsc -b && npx eslint src/pages/DashboardPage.tsx src/components/LinkSheetDialog.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/components/LinkSheetDialog.tsx src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): add Link Google Sheet option to New Event"
```

---

## Task 10: Wire polling + manual sync into the Kiosk page

**Files:**

- Modify: `frontend/src/components/AttendeeTable.tsx`

**Interfaces:**

- Consumes: `useSheetSync(eventId, enabled)` from Task 8; `event.sheetId`, `event.lastSyncedAt` from Task 7's `AppEvent`.

- [ ] **Step 1: Mount `useSheetSync` and render a status/manual-sync control**

In `frontend/src/components/AttendeeTable.tsx`, add the import:

```ts
import { useSheetSync } from '../hooks/useSheetSync';
```

Inside the `AttendeeTable` component, after the existing `useTemplates()` line, add:

```ts
const { syncNow, isSyncing } = useSheetSync(eventId, !!event.sheetId);
```

In the toolbar area (alongside the existing search/segment row — place it as a sibling to the `Segment` buttons row), add, gated on `event.sheetId`:

```tsx
{
  event.sheetId && (
    <button
      onClick={syncNow}
      disabled={isSyncing}
      className="inline-flex h-8.5 items-center gap-1.5 rounded-lg px-3 font-display text-[13px] font-semibold text-muted transition-colors hover:text-ink disabled:opacity-60"
      title={
        event.lastSyncedAt
          ? `Last synced ${new Date(event.lastSyncedAt).toLocaleTimeString()}`
          : undefined
      }
    >
      {isSyncing ? 'Syncing…' : 'Sync now'}
    </button>
  );
}
```

(Exact placement/markup should follow whatever toolbar container `AttendeeTable.tsx` already uses for the `Segment` row and search input — match its existing flex/gap classes rather than introducing a new layout pattern.)

- [ ] **Step 2: Manual verification**

Run `cd backend && npm run dev` and `cd frontend && npm run dev` against a real MongoDB. Since no real Google Sheet is wired up yet in dev, confirm instead via the backend: temporarily set `NODE_ENV=test` is not viable for a manual dev check (bypass is test-only) — so verify this task's UI wiring by checking, in the browser dev tools Network tab, that opening a sheet-linked event's Kiosk page (create one via Task 9's dialog once a real service account + shared sheet are available) fires `POST /events/:id/sync-sheet` every ~7s, and that an XLSX-created event's Kiosk page fires no such request at all.

- [ ] **Step 3: Typecheck and lint**

Run: `cd frontend && npx tsc -b && npx eslint src/components/AttendeeTable.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/components/AttendeeTable.tsx
git commit -m "feat(kiosk): poll sheet-linked events for new attendees, add manual sync"
```

---

## Task 11: Full-plan verification pass

**Files:** none (verification only)

- [ ] **Step 1: Backend full check**

Run: `cd backend && npm run verify`
Expected: `ALL PASSED`, 0 failed.

- [ ] **Step 2: Backend production smoke**

Run: `cd backend && npm run smoke`
Expected: passes — confirms the two new required env vars don't break the compiled production boot path (the smoke script's throwaway env must also set `GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_SERVICE_ACCOUNT_KEY`; if `smoke`'s own env bootstrap doesn't already set every var `env.ts` requires, add the same two fake values there as in Task 1 Step 3).

- [ ] **Step 3: Frontend full validate**

Run: `cd frontend && npm run validate`
Expected: prettier clean, eslint clean, `tsc -b` clean.

- [ ] **Step 4: End-to-end manual pass with a real sheet**

With a real Google Cloud service account created and its email/key set in `backend/.env`: share a real per-event sheet (or a test copy with the confirmed headers) with that email, link it via the dashboard's "Link Google Sheet" flow, confirm the initial roster appears, add a new row to the sheet, and confirm it appears on the open Kiosk page within ~7-14 seconds without a manual refresh. Confirm the "Sync now" button also works and that clicking it against a sheet that's been unshared produces a visible error toast (not a silent failure).

- [ ] **Step 5: Final commit if any fixups were needed**

```bash
cd backend && git add -A && git commit -m "fix: address issues found in full verification pass"
cd frontend && git add -A && git commit -m "fix: address issues found in full verification pass"
```

(Only run this step if Steps 1-4 actually required code changes — skip it otherwise.)
