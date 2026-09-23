# Main Sheet Tab Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator create an event by picking a tab from the fixed Main Sheet (one dropdown, one date field) instead of manually creating a per-event spreadsheet and pasting its URL, or uploading an XLSX file.

**Architecture:** Backend gains `GET /events/sheet-tabs` (one read-only metadata call, merged with which tabs are reserved by a live or trashed event). `POST /events/sheet` switches from `sheetUrl` to `tabGid`, resolving `MAIN_SHEET_ID` server-side; a partial unique index guarantees one event per tab. Sync reads tab-linked events by resolving gid → current title each tick (rename-proof, read-only scope), then reading that tab; legacy per-spreadsheet events sync exactly as today. Frontend replaces the two "New event" dialogs with one tab-picker dialog, and the kiosk shows a persistent notice when background sync fails.

**Tech Stack:** Express 5 + Mongoose 9 + Zod 4 (backend), React 19 + TypeScript + React Query (frontend), Google Sheets API v4 via `google-auth-library`'s `JWT` client with the `spreadsheets.readonly` scope (no `googleapis` package).

**Spec:** `frontend/docs/superpowers/specs/2026-09-22-main-sheet-tab-linking-design.md`

## Global Constraints

- One fixed Main Sheet spreadsheet ID (`MAIN_SHEET_ID` env var) for new events. Sync always reads `event.sheetId`, never `env.MAIN_SHEET_ID` directly.
- Tabs are tracked by their stable numeric `gid`, never by title. The title is re-resolved on every sync and **never cached** (a cached title can point at a different tab after rename + reuse of the old name).
- **Do not use `values.batchGetByDataFilter`** — it requires a write scope; we are read-only.
- A tab is reserved while its event is live **or trashed**; only a permanent delete frees it. Enforced by the `one_event_per_tab` unique index, not just the UI.
- An event's `name` is set once at creation (pre-filled from the tab title, editable) and never re-synced.
- Legacy events (null `tabGid`) keep syncing unchanged — no migration.
- Backend `POST /events` is **not** removed — only the frontend path to it.
- Testing: backend `npm run verify` (integration, in-memory Mongo), no unit tests. Frontend has no test suite — `npm run validate` plus a manual dev-server check.
- Pre-commit runs `eslint --fix` + prettier on staged files — every commit must be lint-clean (no unused imports).

---

## Task 1: Config + data model — `MAIN_SHEET_ID`, `Event.tabGid`, one-event-per-tab index

**Files:**

- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Modify: `backend/.env` (local only, not committed)
- Modify: `backend/src/models/event.model.ts`
- Test: `backend/scripts/verify.ts`

**Interfaces:**

- Produces: `env.MAIN_SHEET_ID: string`. `EventDoc.tabGid: number | null`. Index `one_event_per_tab`. `testEnv` in `verify.ts` (reused by Tasks 3 and 5).

- [ ] **Step 1: Set the env var in the harness and add the failing assertion**

In `backend/scripts/verify.ts`, add after the `GOOGLE_SERVICE_ACCOUNT_KEY` assignment (~line 33):

```ts
process.env.MAIN_SHEET_ID = 'test-main-sheet-id';
```

Right after the `fetchSheetRows returns the fixture rows set for a sheetId` check (~line 112, before `await connectDb();`), add:

```ts
const { env: testEnv } = await import('../src/config/env');
check('env.MAIN_SHEET_ID is loaded', testEnv.MAIN_SHEET_ID === 'test-main-sheet-id');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && npm run verify`
Expected: `✗ env.MAIN_SHEET_ID is loaded` (Zod strips unknown keys, so the value is `undefined`).

- [ ] **Step 3: Add `MAIN_SHEET_ID` to the env schema**

In `backend/src/config/env.ts`, after `GOOGLE_SERVICE_ACCOUNT_KEY`:

```ts
  MAIN_SHEET_ID: z.string().min(1, 'MAIN_SHEET_ID is required'),
```

- [ ] **Step 4: Document it and set it locally**

In `backend/.env.example`, after the `GOOGLE_SERVICE_ACCOUNT_KEY` line:

```
# The one Google Sheet new events are created from — one tab per event.
# Share it (Viewer) with the service account above.
MAIN_SHEET_ID=1a2b3c4d5e6f...
```

Add the real `MAIN_SHEET_ID=...` to your local `backend/.env` now — `npm run dev` and `npm run smoke` both read it and will exit on boot without it.

- [ ] **Step 5: Add `tabGid` and the index to the `Event` model**

In `backend/src/models/event.model.ts`, add `tabGid: number | null;` to `EventDoc` after `sheetUrl`, and to the schema:

```ts
  sheetUrl: { type: String, default: null },
  // Main Sheet tab this event reads from, by stable gid (tabs can be renamed). null → legacy/XLSX event.
  tabGid: { type: Number, default: null },
```

Before `export const EventModel`:

```ts
// One event per Main Sheet tab. Trashed events keep their reservation so a restore can't collide;
// only a hard delete frees the tab. Null tabGids (legacy/XLSX events) are outside the index.
eventSchema.index(
  { sheetId: 1, tabGid: 1 },
  {
    unique: true,
    partialFilterExpression: { tabGid: { $type: 'number' } },
    name: 'one_event_per_tab',
  },
);
```

- [ ] **Step 6: Run verify again**

Run: `cd backend && npm run verify`
Expected: `✓ env.MAIN_SHEET_ID is loaded`, `0` failures.

- [ ] **Step 7: Commit**

```bash
cd backend
git add src/config/env.ts .env.example src/models/event.model.ts scripts/verify.ts
git commit -m "feat: add MAIN_SHEET_ID config and Event.tabGid with one-event-per-tab index"
```

---

## Task 2: List a sheet's tabs + read a tab by gid (read-only scope)

**Files:**

- Modify: `backend/src/services/sheetSync.services.ts`
- Test: `backend/scripts/verify.ts`

**Interfaces:**

- Consumes: `getJwtClient()` (existing, same file).
- Produces:
  - `SheetTab { gid: number; title: string }`
  - `tabRange(title: string): string`
  - `listSheetTabs(sheetId: string): Promise<SheetTab[]>`
  - `fetchTabRows(sheetId: string, tabGid: number): Promise<string[][]>`
  - `TAB_REMOVED_MESSAGE`
  - Test-only: `__setTestSheetTabs(sheetId, tabs)`, `__setTestTabValues(sheetId, title, rows)`

- [ ] **Step 1: Write the failing tests**

In `backend/scripts/verify.ts`, right after Task 1's `MAIN_SHEET_ID` check:

```ts
const { tabRange, listSheetTabs, fetchTabRows, __setTestSheetTabs, __setTestTabValues } =
  await import('../src/services/sheetSync.services');

check('tabRange quotes a plain title', tabRange('DevFest') === "'DevFest'!A:Z");
check('tabRange escapes an apostrophe', tabRange("Women's Tech") === "'Women''s Tech'!A:Z");

__setTestSheetTabs('tabs-fixture', [
  { gid: 111, title: 'DevFest Tashkent' },
  { gid: 222, title: 'Archive' },
]);
const fixtureTabs = await listSheetTabs('tabs-fixture');
check(
  'listSheetTabs returns gid + title',
  fixtureTabs.length === 2 &&
    fixtureTabs[0].gid === 111 &&
    fixtureTabs[0].title === 'DevFest Tashkent',
  fixtureTabs,
);

__setTestTabValues('tabs-fixture', 'DevFest Tashkent', [
  ['Reg. Number', 'Full Name'],
  ['R1', 'Jane Doe'],
]);
check(
  'fetchTabRows resolves gid → title and reads that tab',
  (await fetchTabRows('tabs-fixture', 111)).length === 2,
);

const missingTab = await fetchTabRows('tabs-fixture', 333).then(
  () => 'did not throw',
  (err) => err.status,
);
check('fetchTabRows on a gid not in the sheet → 400', missingTab === 400, missingTab);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && npm run verify`
Expected: fails at import — none of the new exports exist yet.

- [ ] **Step 3: Share one fetch + error helper across all Sheets reads**

In `backend/src/services/sheetSync.services.ts`, below `getJwtClient()`, add a helper and refactor `fetchSheetRows` onto it (same behavior, one place for the error message):

```ts
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// Every Sheets read funnels through here so access failures surface one friendly message.
async function sheetsGet<T>(sheetId: string, path: string, context: string): Promise<T> {
  try {
    const res = await getJwtClient().request<T>({ url: `${SHEETS_API}/${sheetId}${path}` });
    return res.data;
  } catch (err) {
    console.error(`[sheetSync] ${context} failed for sheetId`, sheetId, err);
    throw new AppError(
      400,
      `Can't read this Google Sheet — share it with ${env.GOOGLE_SERVICE_ACCOUNT_EMAIL} and try again.`,
    );
  }
}
```

```ts
export async function fetchSheetRows(sheetId: string): Promise<string[][]> {
  if (isTest) return testRowsBySheetId.get(sheetId) ?? [];
  const data = await sheetsGet<{ values?: string[][] }>(sheetId, '/values/A:Z', 'fetchSheetRows');
  return data.values ?? [];
}
```

- [ ] **Step 4: Add tab listing and gid-based reads**

After `fetchSheetRows`:

```ts
export interface SheetTab {
  gid: number;
  title: string;
}

export const TAB_REMOVED_MESSAGE =
  "This event's tab no longer exists in the Main Sheet — restore it in Google Sheets to resume syncing.";

// Test bypass: stubs only the two HTTP reads, so gid → title resolution runs for real in verify.
const testTabsBySheetId = new Map<string, SheetTab[]>();
const testValuesByTab = new Map<string, string[][]>(); // `${sheetId}|${title}`

export function __setTestSheetTabs(sheetId: string, tabs: SheetTab[]): void {
  if (!isTest) throw new Error('__setTestSheetTabs is test-only');
  testTabsBySheetId.set(sheetId, tabs);
}

export function __setTestTabValues(sheetId: string, title: string, rows: string[][]): void {
  if (!isTest) throw new Error('__setTestTabValues is test-only');
  testValuesByTab.set(`${sheetId}|${title}`, rows);
}

/** A1 range for a whole tab — quoted so spaces, apostrophes and Cyrillic titles parse. */
export function tabRange(title: string): string {
  return `'${title.replace(/'/g, "''")}'!A:Z`;
}

/** Metadata only — never reads cell values. */
export async function listSheetTabs(sheetId: string): Promise<SheetTab[]> {
  if (isTest) return testTabsBySheetId.get(sheetId) ?? [];
  const data = await sheetsGet<{ sheets?: { properties: { sheetId: number; title: string } }[] }>(
    sheetId,
    '?fields=sheets.properties(sheetId,title)',
    'listSheetTabs',
  );
  return (data.sheets ?? []).map(({ properties: p }) => ({ gid: p.sheetId, title: p.title }));
}

/**
 * Reads a tab by its stable gid. The title is re-resolved every call, never cached: after a
 * rename + reuse of the old name, a cached title would read another event's tab.
 * (values.batchGetByDataFilter reads by gid directly but needs a write scope.)
 */
export async function fetchTabRows(sheetId: string, tabGid: number): Promise<string[][]> {
  const tab = (await listSheetTabs(sheetId)).find((t) => t.gid === tabGid);
  if (!tab) throw new AppError(400, TAB_REMOVED_MESSAGE);
  if (isTest) return testValuesByTab.get(`${sheetId}|${tab.title}`) ?? [];
  const data = await sheetsGet<{ values?: string[][] }>(
    sheetId,
    `/values/${encodeURIComponent(tabRange(tab.title))}`,
    'fetchTabRows',
  );
  return data.values ?? [];
}
```

- [ ] **Step 5: Run verify again**

Run: `cd backend && npm run verify`
Expected: all new checks pass, `0` failures (existing `fetchSheetRows` checks unchanged).

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/services/sheetSync.services.ts scripts/verify.ts
git commit -m "feat: list sheet tabs and read a tab by gid with the read-only scope"
```

---

## Task 3: Sync branches on `tabGid`

**Files:**

- Modify: `backend/src/services/sheetSync.services.ts`
- Test: `backend/scripts/verify.ts`

**Interfaces:**

- Consumes: `fetchTabRows` (Task 2), `EventDoc.tabGid` (Task 1).
- Produces: `syncEventAttendees(eventId)` — same signature, now routes tab-linked vs legacy.

- [ ] **Step 1: Write the failing tests**

In `backend/scripts/verify.ts`, at the end of the `--- SHEET SYNC: upsert + orchestration ---` block (right after the `restored row brings the attendee back` check, before `// --- ACTIVITY LOG ---`):

```ts
// Tab-linked sync: reads by gid, survives a rename, and a removed tab leaves the roster alone.
__setTestSheetTabs(testEnv.MAIN_SHEET_ID, [{ gid: 444, title: 'Expo' }]);
__setTestTabValues(testEnv.MAIN_SHEET_ID, 'Expo', [
  ['Reg. Number', 'Full Name'],
  ['T1', 'Nina Ray'],
]);
const tabEvent = await SyncEventModel.create({
  name: 'Tab Linked Event',
  date: new Date(),
  authorId: new mongoose.Types.ObjectId(),
  sheetId: testEnv.MAIN_SHEET_ID,
  tabGid: 444,
});
const tabSync = await syncEventAttendees(String(tabEvent._id));
check('tab-linked sync reads the tab by gid', tabSync.added === 1, tabSync);

__setTestSheetTabs(testEnv.MAIN_SHEET_ID, [{ gid: 444, title: 'Expo 2026' }]); // renamed
__setTestTabValues(testEnv.MAIN_SHEET_ID, 'Expo 2026', [
  ['Reg. Number', 'Full Name'],
  ['T1', 'Nina Ray'],
  ['T2', 'Omar Fay'],
]);
const renamedSync = await syncEventAttendees(String(tabEvent._id));
check(
  'tab-linked sync survives a tab rename',
  renamedSync.added === 1 && renamedSync.removed === 0,
  renamedSync,
);

__setTestSheetTabs(testEnv.MAIN_SHEET_ID, []); // tab deleted
const removedTab = await syncEventAttendees(String(tabEvent._id)).then(
  () => 'did not throw',
  (err) => err.status,
);
check('sync on a removed tab → 400', removedTab === 400, removedTab);
check(
  'removed tab leaves the roster untouched',
  (await listAttendees(String(tabEvent._id))).length === 2,
);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && npm run verify`
Expected: `✗ tab-linked sync reads the tab by gid` — sync still calls `fetchSheetRows(event.sheetId)`, which returns `[]` for the unset legacy fixture → `added: 0`.

- [ ] **Step 3: Branch the fetch**

In `syncEventAttendees`, replace the one line `const rows = await fetchSheetRows(event.sheetId);` with:

```ts
const rows =
  event.tabGid != null
    ? await fetchTabRows(event.sheetId, event.tabGid)
    : await fetchSheetRows(event.sheetId);
```

Everything else in the function stays as is. Because a removed tab throws _before_ `mapSheetRows`, the roster and `lastSyncedAt` are never touched on that path.

- [ ] **Step 4: Run verify again**

Run: `cd backend && npm run verify`
Expected: new checks pass; all legacy `fixture-sheet-2` checks still pass; `0` failures.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/services/sheetSync.services.ts scripts/verify.ts
git commit -m "feat: route sheet sync through gid-resolved tab reads for tab-linked events"
```

---

## Task 4: Extract `isDuplicateKeyError` to `utils/`

**Files:**

- Create: `backend/src/utils/isDuplicateKeyError.ts`
- Modify: `backend/src/services/template.services.ts`

**Interfaces:**

- Produces: `isDuplicateKeyError(err: unknown): boolean` — used by Task 5 and the existing default-template seed.

- [ ] **Step 1: Create the util**

```ts
// backend/src/utils/isDuplicateKeyError.ts
/** Mongo E11000 — a unique index rejected the write. */
export function isDuplicateKeyError(err: unknown): boolean {
  return (err as { code?: number } | null)?.code === 11000;
}
```

- [ ] **Step 2: Use it in `ensureDefaultTemplate`**

In `backend/src/services/template.services.ts`, replace the inline `isDuplicateKey` computation (its second clause re-checks the same `code === 11000`, so it is redundant) with:

```ts
import { isDuplicateKeyError } from '../utils/isDuplicateKeyError';
```

```ts
  } catch (err) {
    // Two instances racing to seed on cold boot both upsert; the loser hits the
    // partial unique index (one_default_template) — harmless, the winner already did the job.
    if (!isDuplicateKeyError(err)) throw err;
    console.log('[templates] default already seeded by another instance');
  }
```

- [ ] **Step 3: Verify + commit**

Run: `cd backend && npm run verify` → `0` failures (the idempotent-seed check still passes).

```bash
cd backend
git add src/utils/isDuplicateKeyError.ts src/services/template.services.ts
git commit -m "refactor: extract isDuplicateKeyError util"
```

---

## Task 5: `GET /events/sheet-tabs` + `POST /events/sheet` takes `tabGid`

One task, one test block, so no two tasks edit the same `verify.ts` region.

**Files:**

- Modify: `backend/src/validators/event.validators.ts`
- Modify: `backend/src/services/event.services.ts`
- Modify: `backend/src/services/sheetSync.services.ts` (delete `extractSheetId`)
- Modify: `backend/src/controllers/event.controllers.ts`
- Modify: `backend/src/routes/event.routes.ts`
- Test: `backend/scripts/verify.ts`

**Interfaces:**

- Consumes: `listSheetTabs`, `syncEventAttendees` (Tasks 2–3), `env.MAIN_SHEET_ID`, `isDuplicateKeyError` (Task 4).
- Produces: `GET /events/sheet-tabs → { gid, title, status: 'available' | 'linked' | 'trashed' }[]`. `CreateEventFromSheetInput = { name: string; date: string; tabGid: number }`.

- [ ] **Step 1: Replace the HTTP test block**

In `backend/scripts/verify.ts`, replace the whole `// --- SHEET-LINKED EVENTS: creation + on-demand sync over HTTP ---` block (from that comment down to, but not including, `// --- SHEET SYNC: upsert + orchestration ...`, ~lines 677–731) with:

```ts
// --- SHEET-LINKED EVENTS: Main Sheet tab picker, creation, on-demand sync over HTTP ---
type TabRow = { gid: number; status: string };
const tabStatus = async (gid: number) =>
  ((await afetch('/events/sheet-tabs').then((r) => r.json())) as TabRow[]).find(
    (t) => t.gid === gid,
  )?.status;
const createFromTab = (tabGid: unknown) =>
  afetch('/events/sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'DevFest Tashkent', date: '2026-10-01', tabGid }),
  });

__setTestSheetTabs(testEnv.MAIN_SHEET_ID, [
  { gid: 111, title: 'DevFest Tashkent' },
  { gid: 222, title: 'Archive' },
]);
__setTestTabValues(testEnv.MAIN_SHEET_ID, 'DevFest Tashkent', [
  ['Reg. Number', 'First Name', 'Last Name', 'Occupation', 'Full Name'],
  ['R1', 'Alice', 'Lee', 'Designer', 'Alice Lee'],
]);

const tabsRes = await afetch('/events/sheet-tabs');
const tabsBody = await tabsRes.json();
check('GET /events/sheet-tabs → 200', tabsRes.status === 200, tabsBody);
check(
  'GET /events/sheet-tabs → all available before linking',
  tabsBody.length === 2 && tabsBody.every((t: TabRow) => t.status === 'available'),
  tabsBody,
);

const createSheetEventRes = await createFromTab(111);
const sheetEvent = await createSheetEventRes.json();
check('POST /events/sheet → 201', createSheetEventRes.status === 201, sheetEvent);
check('POST /events/sheet → initial roster of 1', sheetEvent.added === 1, sheetEvent);
check(
  'POST /events/sheet → stores Main Sheet id + tabGid',
  sheetEvent.sheetId === testEnv.MAIN_SHEET_ID && sheetEvent.tabGid === 111,
  sheetEvent,
);
check('GET /events/sheet-tabs → linked after creation', (await tabStatus(111)) === 'linked');

const { EventModel: TabEventModel } = await import('../src/models/event.model');
await TabEventModel.init(); // the unique index must be built before asserting on it
const dupRes = await createFromTab(111);
check('POST /events/sheet on an already-linked tab → 409', dupRes.status === 409, dupRes.status);

const eventCount = async () => (await afetch('/events').then((r) => r.json())).length;
const countBeforeBadGid = await eventCount();
const unknownGidRes = await createFromTab(999);
check(
  'POST /events/sheet with a gid not in the Main Sheet → 400',
  unknownGidRes.status === 400,
  unknownGidRes.status,
);
check('unknown gid leaves no half-created event', (await eventCount()) === countBeforeBadGid);

const badGidRes = await createFromTab('not-a-number');
check('POST /events/sheet with non-numeric tabGid → 400', badGidRes.status === 400);

__setTestTabValues(testEnv.MAIN_SHEET_ID, 'DevFest Tashkent', [
  ['Reg. Number', 'First Name', 'Last Name', 'Occupation', 'Full Name'],
  ['R1', 'Alice', 'Lee', 'Designer', 'Alice Lee'],
  ['R2', 'Bob', 'Kim', 'PM', 'Bob Kim'], // walk-in registers mid-event
]);
const syncRes = await afetch(`/events/${sheetEvent._id}/sync-sheet`, { method: 'POST' });
const syncBody = await syncRes.json();
check('POST /events/:id/sync-sheet → picks up the walk-in', syncBody.added === 1, syncBody);
check(
  'POST /events/:id/sync-sheet → returns lastSyncedAt',
  typeof syncBody.lastSyncedAt === 'string' && !Number.isNaN(Date.parse(syncBody.lastSyncedAt)),
  syncBody,
);

const notLinkedEvents = await afetch('/events').then((r) => r.json());
const xlsxEvent = notLinkedEvents.find((e: { sheetId: string | null }) => !e.sheetId);
const badSyncRes = await afetch(`/events/${xlsxEvent._id}/sync-sheet`, { method: 'POST' });
check(
  'POST /events/:id/sync-sheet on an XLSX event → 400',
  badSyncRes.status === 400,
  badSyncRes.status,
);

// A trashed event keeps its tab (so restoring it is always safe); only a hard delete frees it.
await afetch(`/events/${sheetEvent._id}`, { method: 'DELETE' });
check(
  'GET /events/sheet-tabs → trashed event still holds its tab',
  (await tabStatus(111)) === 'trashed',
);
check(
  'POST /events/sheet on a tab held by a trashed event → 409',
  (await createFromTab(111)).status === 409,
);
await afetch(`/events/${sheetEvent._id}/permanent`, { method: 'DELETE' });
check(
  'GET /events/sheet-tabs → available again after permanent delete',
  (await tabStatus(111)) === 'available',
);
```

Also delete the now-obsolete `extractSheetId` checks near the top (~lines 41–50), leaving:

```ts
const { mapSheetRows } = await import('../src/services/sheetSync.services');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && npm run verify`
Expected: `✗ GET /events/sheet-tabs → 200` (route doesn't exist) and `✗ POST /events/sheet → 201` (Zod still requires `sheetUrl` → 400).

- [ ] **Step 3: Update the validator**

In `backend/src/validators/event.validators.ts`, replace `sheetUrl: z.string().url(),` in `createEventFromSheetSchema` with:

```ts
  tabGid: z.number().int().nonnegative(),
```

- [ ] **Step 4: Update the event service**

In `backend/src/services/event.services.ts`, update imports:

```ts
import { env } from '../config/env';
import { isDuplicateKeyError } from '../utils/isDuplicateKeyError';
import { listSheetTabs, syncEventAttendees } from './sheetSync.services';
```

Add near `listEvents`:

```ts
export type SheetTabStatus = 'available' | 'linked' | 'trashed';

export async function listMainSheetTabs() {
  const [tabs, reserved] = await Promise.all([
    listSheetTabs(env.MAIN_SHEET_ID),
    // No deletedAt filter: trashed events keep their tab, mirroring the one_event_per_tab index.
    EventModel.find(
      { sheetId: env.MAIN_SHEET_ID, tabGid: { $ne: null } },
      { tabGid: 1, deletedAt: 1 },
    ).lean(),
  ]);
  const statusByGid = new Map<number | null, SheetTabStatus>(
    reserved.map((e) => [e.tabGid, e.deletedAt ? 'trashed' : 'linked']),
  );
  return tabs.map((tab) => ({ ...tab, status: statusByGid.get(tab.gid) ?? 'available' }));
}
```

Replace the top of `createEventFromSheet` (the `extractSheetId` lines and the `EventModel.create` call) so it reads:

```ts
export async function createEventFromSheet(input: CreateEventFromSheetInput, author: Author) {
  let event;
  try {
    event = await EventModel.create({
      name: input.name,
      date: new Date(input.date),
      authorId: author.id,
      authorName: author.name,
      authorPicture: author.picture,
      sheetId: env.MAIN_SHEET_ID,
      tabGid: input.tabGid,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError(409, 'That tab already has an event (check the trash) — pick another.');
    }
    throw err;
  }

  // ...existing try { syncEventAttendees } catch { deleteEventCascade } block, unchanged
```

An unknown `tabGid` passes validation, the event is created, the initial sync throws `TAB_REMOVED_MESSAGE` (400), and the existing rollback deletes the event — no extra existence check needed.

Then delete the dead `extractSheetId` function from `sheetSync.services.ts`.

- [ ] **Step 5: Controller + route**

`backend/src/controllers/event.controllers.ts`:

```ts
export async function listSheetTabs(_req: Request, res: Response) {
  res.json(await eventService.listMainSheetTabs());
}
```

`backend/src/routes/event.routes.ts`:

```ts
// Must come before '/:id' — otherwise 'trash'/'sheet-tabs' are parsed as an event id.
eventRouter.get('/trash', controller.listTrash);
eventRouter.get('/sheet-tabs', controller.listSheetTabs);
eventRouter.get('/:id', validate(eventIdParamSchema, 'params'), controller.getOne);
```

- [ ] **Step 6: Run verify + quality gates**

Run: `cd backend && npm run verify` → `0` failures.
Run: `cd backend && npm run validate` → prettier/eslint/typecheck pass.
Run: `cd backend && npm run smoke` → passes (confirms the compiled server boots with `MAIN_SHEET_ID` from `.env`).

- [ ] **Step 7: Commit**

```bash
cd backend
git add src/validators/event.validators.ts src/services/event.services.ts src/services/sheetSync.services.ts src/controllers/event.controllers.ts src/routes/event.routes.ts scripts/verify.ts
git commit -m "feat: create events from Main Sheet tabs; add GET /events/sheet-tabs"
```

---

## Task 6: Surface background sync failures on the kiosk

Independent of the dialog work; typechecks on its own.

**Files:**

- Modify: `frontend/src/hooks/useSheetSync.ts`
- Create: `frontend/src/components/SheetSyncErrorNotice.tsx`
- Modify: `frontend/src/components/AttendeeTable.tsx`

**Interfaces:**

- Produces: `useSheetSync(...)` now also returns `error: string | null`. `SheetSyncErrorNotice({ message })`.

- [ ] **Step 1: Keep the last pull error in `useSheetSync`**

Update the docstring's last line to:

```ts
 * Background ticks never toast; the last failed pull is returned as `error` for a persistent notice.
```

Next to `lastIssues`:

```ts
const [lastError, setLastError] = useState<{ eventId: string; message: string } | null>(null);
```

In the `useMutation` config — clear on success, record on failure:

```ts
    onSuccess: (result) => {
      setLastIssues({ eventId: eventId!, issues: result.issues });
      setLastError(null);
      // ...rest unchanged
    },
    onError: (err) =>
      setLastError({ eventId: eventId!, message: errMessage(err, "Couldn't reach the sheet.") }),
```

Add to the returned object:

```ts
    error: live && lastError?.eventId === eventId ? lastError.message : null,
```

- [ ] **Step 2: Create the notice**

```tsx
// frontend/src/components/SheetSyncErrorNotice.tsx
/** Stays up while the last sheet pull failed — the roster on screen may be stale. */
export function SheetSyncErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="border-b border-line-3 bg-surface-2 px-4 py-2 text-[13px] font-semibold text-danger sm:px-5"
    >
      Sheet sync failed: {message}
    </div>
  );
}
```

- [ ] **Step 3: Render it in `AttendeeTable`**

```tsx
import { SheetSyncErrorNotice } from './SheetSyncErrorNotice';
```

```tsx
const { syncNow, isSyncing, issues, error: syncError } = useSheetSync(eventId, !!event.sheetId);
```

```tsx
        <SheetSyncErrorNotice message={syncError} />
        <SheetIssuesNotice issues={issues} />
```

- [ ] **Step 4: Validate + commit**

Run: `cd frontend && npm run validate` → passes.

```bash
cd frontend
git add src/hooks/useSheetSync.ts src/components/SheetSyncErrorNotice.tsx src/components/AttendeeTable.tsx
git commit -m "feat: show a persistent notice when background sheet sync fails"
```

---

## Task 7: Replace both creation dialogs with the tab picker

One atomic task so every commit typechecks: data layer, new dialog, dashboard wiring, deletions, dead code, and `xlsx` removal together.

**Files:**

- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/useEvents.ts`
- Create: `frontend/src/components/LinkMainSheetTabDialog.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Delete: `frontend/src/components/LinkSheetDialog.tsx`, `frontend/src/components/ImportDialog.tsx`
- Modify: `frontend/package.json`, `frontend/package-lock.json`

**Interfaces:**

- Produces: `SheetTab`, `SheetTabStatus` (types.ts). `api.listSheetTabs()`, `api.createEventFromSheet({ name, date, tabGid })`. `useSheetTabs()`, `useCreateEventFromSheet()`. `LinkMainSheetTabDialog({ onClose, onCreated })`.
- Removes: `NewAttendee`, `api.createEvent`, `useCreateEvent` (only `ImportDialog` used them).

- [ ] **Step 1: `types.ts`**

Add `tabGid: number | null;` to `AppEvent` after `sheetUrl`. Delete the `NewAttendee` interface. Add:

```ts
export type SheetTabStatus = 'available' | 'linked' | 'trashed';

/** One tab of the Main Sheet, as offered by the "New event" picker. */
export interface SheetTab {
  gid: number;
  title: string;
  status: SheetTabStatus;
}
```

- [ ] **Step 2: `api.ts`**

In the type import, replace `NewAttendee` with `SheetTab`. Delete `createEvent`. Replace `createEventFromSheet` and add `listSheetTabs`:

```ts
  listSheetTabs: () => request<SheetTab[]>('/events/sheet-tabs'),

  createEventFromSheet: (payload: { name: string; date: string; tabGid: number }) =>
    request<AppEvent & SheetSyncResult>('/events/sheet', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
```

- [ ] **Step 3: `useEvents.ts`**

Change the type import to `import type { AppEvent } from '../types';`. Delete `useCreateEvent`. Replace `useCreateEventFromSheet` with:

```ts
export function useSheetTabs() {
  // Always refetch on open — tabs get reserved/freed as events are created and deleted.
  return useQuery({ queryKey: ['sheet-tabs'], queryFn: api.listSheetTabs, staleTime: 0 });
}

export function useCreateEventFromSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; date: string; tabGid: number }) =>
      api.createEventFromSheet(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
    // Success or 409, the tab list is now out of date.
    onSettled: () => qc.invalidateQueries({ queryKey: ['sheet-tabs'] }),
  });
}
```

Deleting a permanently-deleted event should also free its tab in the picker: in `usePermanentDeleteEvent`'s `onSuccess`, add `qc.invalidateQueries({ queryKey: ['sheet-tabs'] });`.

- [ ] **Step 4: Create the dialog**

```tsx
// frontend/src/components/LinkMainSheetTabDialog.tsx
import { useState } from 'react';
import { useCreateEventFromSheet, useSheetTabs } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { todayLocal } from '../lib/format';
import { cn } from '../lib/cn';
import { Button } from './ui/Button';
import { inputBaseClass } from './ui/Input';
import { Dialog } from './ui/Dialog';
import { ChevronDownIcon } from './icons';
import { EventDetailsFields } from './EventDetailsFields';
import type { AppEvent, SheetTabStatus } from '../types';

const STATUS_SUFFIX: Record<SheetTabStatus, string> = {
  available: '',
  linked: ' (already added)',
  trashed: ' (in trash)',
};

export function LinkMainSheetTabDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (event: AppEvent) => void;
}) {
  const [eventName, setEventName] = useState('');
  const [autoName, setAutoName] = useState(''); // last title we filled in, to tell it from a typed name
  const [eventDate, setEventDate] = useState(todayLocal);
  const [tabGid, setTabGid] = useState<number | null>(null);
  const { data: tabs = [], isLoading, isError, error } = useSheetTabs();
  const createFromSheet = useCreateEventFromSheet();

  function handleTabChange(value: string) {
    const tab = tabs.find((t) => t.gid === Number(value));
    if (!tab) return;
    setTabGid(tab.gid);
    // Only overwrite a name the operator hasn't customized.
    if (!eventName.trim() || eventName === autoName) setEventName(tab.title);
    setAutoName(tab.title);
  }

  const canCreate = !!eventName.trim() && tabGid !== null;

  async function handleCreate() {
    if (tabGid === null) return;
    try {
      const created = await createFromSheet.mutateAsync({
        name: eventName.trim(),
        date: eventDate,
        tabGid,
      });
      toast(`Event created — ${created.added} attendee(s) synced`);
      onCreated(created);
    } catch (err) {
      setTabGid(null); // a 409 means the list just refetched with this tab disabled
      toast(errMessage(err, "Couldn't create the event — try again."));
    }
  }

  return (
    <Dialog
      size="lg"
      title="New event"
      description="Pick the event's tab from the Main Sheet — the roster syncs automatically."
      busy={createFromSheet.isPending}
      onClose={onClose}
      footer={
        <>
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
            {createFromSheet.isPending ? 'Creating…' : 'Create event'}
          </Button>
        </>
      }
    >
      <label className="mt-3.5 flex flex-col gap-1.5">
        <span className="font-display text-xs font-semibold text-ink-3">Sheet tab</span>
        <div className="relative">
          <select
            className={cn(inputBaseClass, 'w-full appearance-none pr-9')}
            value={tabGid ?? ''}
            disabled={isLoading || isError}
            onChange={(e) => handleTabChange(e.target.value)}
          >
            <option value="" disabled>
              {isLoading ? 'Loading tabs…' : 'Select a tab'}
            </option>
            {tabs.map((tab) => (
              <option key={tab.gid} value={tab.gid} disabled={tab.status !== 'available'}>
                {tab.title}
                {STATUS_SUFFIX[tab.status]}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
          />
        </div>
        {isError && (
          <span className="text-xs text-danger">
            {errMessage(error, "Couldn't load the Main Sheet's tabs — try again.")}
          </span>
        )}
      </label>

      <EventDetailsFields
        name={eventName}
        date={eventDate}
        onNameChange={setEventName}
        onDateChange={setEventDate}
      />
    </Dialog>
  );
}
```

- [ ] **Step 5: Rewire `DashboardPage.tsx`**

The dialog is small now, so it's imported directly — no `lazy`/`Suspense`. Replace the imports block, the two `lazy` consts, the `NewEventMode` type, and the `// Lazy so the ~500KB xlsx parser…` comment with:

```tsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEvents } from '../hooks/useEvents';
import { EventCard } from '../components/EventCard';
import { LinkMainSheetTabDialog } from '../components/LinkMainSheetTabDialog';
import { UploadIcon } from '../components/icons';
import { Button } from '../components/ui/Button';
import { EmptyState, LoadingPanel } from '../components/ui/EmptyState';
import { todayLocal } from '../lib/format';
import type { AppEvent } from '../types';
```

Leave `dayOf`, `splitByDate`, and `EventSection` unchanged. Replace `DashboardPage` with:

```tsx
export function DashboardPage() {
  const { data: events = [], isLoading } = useEvents();
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();
  const { upcoming, past } = useMemo(() => splitByDate(events), [events]);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-ink">Events</h1>
        <Button
          onClick={() => setDialogOpen(true)}
          className="h-11 gap-2 rounded-full px-[18px] text-sm"
        >
          <UploadIcon size={16} /> New event
        </Button>
      </div>

      {isLoading ? (
        <LoadingPanel>Loading events…</LoadingPanel>
      ) : events.length > 0 ? (
        <>
          <EventSection title="Upcoming events" events={upcoming} emptyText="No upcoming events." />
          <EventSection title="Past events" events={past} emptyText="No past events yet." />
        </>
      ) : (
        <EmptyState
          title="No events yet"
          subtitle="Pick a tab from the Main Sheet to create your first event."
        />
      )}

      {dialogOpen && (
        <LinkMainSheetTabDialog
          onClose={() => setDialogOpen(false)}
          onCreated={(event) => {
            setDialogOpen(false);
            navigate(`/app/events/${event._id}`);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Delete the old dialogs and `xlsx`**

```bash
cd frontend
git rm src/components/LinkSheetDialog.tsx src/components/ImportDialog.tsx
npm uninstall xlsx
```

Then confirm nothing still references the removed code:

```bash
grep -rn "xlsx\|NewAttendee\|useCreateEvent\b\|createEvent:\|sheetUrl: string }" src
```

Expected: no matches (`AppEvent.sheetUrl` stays — legacy events still carry it).

- [ ] **Step 7: Full validation**

Run: `cd frontend && npm run validate` → passes.
Run: `cd frontend && npm run build` → passes, and the build output no longer has an `xlsx` chunk.

- [ ] **Step 8: Manual check in the browser**

Run both apps (`npm run dev` in each), backend pointed at a real Mongo with `MAIN_SHEET_ID` + service-account vars set, Main Sheet shared (Viewer) with the service account.

- "New event" opens the dialog directly (no chooser); the select shows a chevron and loads tab titles.
- Pick a tab → name auto-fills. Type a custom name, pick another tab → the custom name is kept.
- Create → lands on the kiosk with the synced roster.
- Reopen the dialog → that tab shows "(already added)", disabled.
- Rename the tab in Google Sheets → the kiosk keeps syncing (add a row; it appears within ~30 s).
- Delete the tab in Google Sheets (on a throwaway event) → the kiosk shows "Sheet sync failed: …" within ~30 s; undo the delete in Sheets → the notice clears on the next pull.
- Trash the event → its tab shows "(in trash)". Permanently delete it from trash → the tab is available again.
- A legacy (URL-linked) event, if any exist, still syncs.

- [ ] **Step 9: Commit**

```bash
cd frontend
git add -A src package.json package-lock.json
git commit -m "feat: create events from a Main Sheet tab picker; drop XLSX import"
```

---

## Task 8: Update project docs

**Files:**

- Modify: `frontend/docs/CLAUDE.md`
- Modify: `backend/CLAUDE.md`

- [ ] **Step 1: `frontend/docs/CLAUDE.md`**

- **Commands → Environment:** add `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `MAIN_SHEET_ID` to the `backend/.env` list.
- **Data flow:** replace the "Import is client-side" bullet with: events are created by picking a tab from the Main Sheet (`LinkMainSheetTabDialog` → `POST /events/sheet { name, date, tabGid }`). Tabs are tracked by gid; sync re-resolves gid → title each pull with the read-only scope (never `batchGetByDataFilter`, never a cached title). `one_event_per_tab` reserves a tab while its event is live or trashed. Legacy URL-linked events (`tabGid: null`) read `values/A:Z` of their own `sheetId`. `POST /events` remains as a backend primitive used by `verify`; there is no XLSX import in the UI.
- **Data flow → sheet-linked kiosks:** note that background pull failures show as a persistent `SheetSyncErrorNotice`.
- **Known gaps:** drop "No walk-in attendee support" if walk-ins now arrive via the bot → Main Sheet (confirm with the team), and add the Sheets read quota note (~15 kiosk screens on tab-linked events).

- [ ] **Step 2: `backend/CLAUDE.md`**

- Line 7: the frontend no longer parses spreadsheets — events come from Main Sheet tabs synced server-side.
- Add `MAIN_SHEET_ID` wherever env vars are listed, and a short note on `one_event_per_tab` next to the Event model description.

- [ ] **Step 3: Commit (each repo)**

```bash
cd frontend && git add docs/CLAUDE.md && git commit -m "docs: document Main Sheet tab linking"
cd ../backend && git add CLAUDE.md && git commit -m "docs: document Main Sheet tab linking"
```

---

## Deployment (after all tasks)

Order matters — the backend exits on boot without `MAIN_SHEET_ID`:

1. Share the Main Sheet (Viewer) with the service account email.
2. Add `MAIN_SHEET_ID` to Railway's backend service variables.
3. `cd backend && npm run smoke`, then deploy backend.
4. Deploy frontend.

---

## Self-Review Notes

- **Spec coverage:** config, `tabGid` + `one_event_per_tab` index, `GET /events/sheet-tabs` with `status`, read-only gid → title sync, deterministic tab-removed error, 409 on double-link, trash keeps the reservation, kiosk sync-error notice, dialog (chevron, safe auto-fill), dead-code + `xlsx` removal, docs, deploy order — each maps to a task.
- **Review fixes folded in:** write-scope API avoided (Task 2); trash/restore collision and race closed by the index (Tasks 1, 5); silent background failures surfaced (Task 6); sync reads `event.sheetId` (Task 3); env var set locally before smoke/dev (Task 1); duplicate `const` across tasks removed by merging the HTTP tasks (Task 5); every frontend commit is lint- and type-clean (Tasks 6, 7).
- **Type consistency:** `tabGid: number | null` across `EventDoc`, `AppEvent`; `SheetTabStatus` identical on both sides; `CreateEventFromSheetInput.tabGid: number`.
