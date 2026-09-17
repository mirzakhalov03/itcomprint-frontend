# Optimization Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 35 findings from the optimization audit. The aims: stop silent failures, cut redundant network and DB work, make the kiosk preview match the printed badge, keep sheet-linked stations in sync, and remove duplication and dead code.

**Architecture:** No new layers. Backend changes stay inside the existing `routes → controllers → services → models` layering and are verified by `scripts/verify.ts`. Frontend changes reuse React Query keys (`['events']`, `['attendees', eventId]`, `['templates']`), add a few small shared modules (`lib/format.ts`, `printer/zones.ts`, `ui/Dialog.tsx`, two hooks), and patch the cache instead of refetching.

**Tech Stack:** Frontend: Vite 8 · React 19 · TypeScript · Tailwind v4 · React Query 5 · Zustand 5. Backend: Express 5 · Mongoose 9 · Zod 4 · Node 22.

**Spec:** Audit report https://claude.ai/artifact/Vq2E6DekctF3hZxuozt6XM (finding IDs such as `U1`, `P1` and `B1` refer to it). Project context lives in `frontend/docs/CLAUDE.md` and `backend/CLAUDE.md`.

## Decisions already made by the user (do not re-litigate)

| Finding                         | Decision                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **U5** Kiosk "Template" tab     | **Keep it. Don't touch it.** No edits to the Template-tab JSX or its handlers (`patchZone`, `moveZone`, `addZone`, `saveTemplate`) in `BadgePrintPanel.tsx`. Only the preview block, the draft seeding and the template resolution change (Task FE-2). |
| **U10** Cross-station freshness | **Required for sheet-linked events.** Stations viewing a sheet-linked event must see each other's prints (roster) and edits (event name and template switch) without a manual refresh (Task FE-3).                                                     |
| **B3** Server-side search path  | **Remove it** (Task BE-1).                                                                                                                                                                                                                             |

## Global Constraints

- **No unit tests** (project preference). The backend's test harness is `npm run verify`. Add or adjust `check(...)` assertions there. Frontend gate: `npm run validate && npm run build`, plus the manual checks listed in each task.
- Backend naming: `*.routes.ts`, `*.controllers.ts`, `*.services.ts`, `*.validators.ts`, `*.model.ts`, `*.middleware.ts`. Services throw `new AppError(status, message)`. **Never** add an `asyncHandler`, and **never** assign `req.query = …`.
- Use Tailwind token utilities only (`bg-brand`, `text-ink`, `border-line`, …). No new raw hex values in components.
- Comments: one line, and only for the non-obvious _why_.
- Don't add dependencies.
- Copy style: specific, human, no apologies. Use an em dash in error toasts (e.g. `Couldn't import that event — try again.`).
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Commit message style matches the repos: `type(scope): summary` (e.g. `perf(kiosk): patch printed attendee in cache`).
- Husky runs lint-staged on commit. If a hook reformats files, re-stage and commit again. Never use `--no-verify`.

---

## Execution model: lanes, waves and file ownership

Tasks in the **same lane run sequentially**. Different lanes can run **in parallel** because they never edit the same file. Frontend Wave-B tasks each run in their own git worktree branched from the commit that finished FE-0.

```
Wave A ─┬─ Backend lane:  BE-1 → BE-2 → BE-3            (backend repo, one working tree)
        └─ Frontend:      FE-0 (foundation, blocks Wave B)
Wave B ─── FE-1 ‖ FE-2 ‖ FE-3 ‖ FE-4 ‖ FE-5              (frontend worktrees, parallel)
Wave C ─── Merge Wave B → OPS-1 (needs user approval) → DOC-1 → INT-1 (integration)
```

**File ownership (a task may only edit the files listed on its row):**

| Task  | Files (M = modify, C = create, D = delete)                                                                                                                                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BE-1  | M `backend/src/validators/attendee.validators.ts`, `services/attendee.services.ts`, `controllers/attendee.controllers.ts`, `models/attendee.model.ts`, `routes/event.routes.ts`, `services/event.services.ts` (search bits only), `services/sheetSync.services.ts` (search bits only), `scripts/verify.ts`                                                   |
| BE-2  | C `backend/src/utils/author.ts`; M `services/event.services.ts`, `controllers/event.controllers.ts`, `services/sheetSync.services.ts` (sync result only), `server.ts`, `scripts/verify.ts`                                                                                                                                                                   |
| BE-3  | M `backend/src/services/template.services.ts`, `models/badgeTemplate.model.ts`, `services/auth.services.ts`, `controllers/auth.controllers.ts`, `models/user.model.ts`, `app.ts`, `validators/event.validators.ts`, `server.ts`, `scripts/verify.ts`                                                                                                         |
| FE-0  | M `frontend/src/App.tsx`, `pages/KioskPage.tsx`, `lib/api.ts`, `types.ts`, `store/toastStore.ts`, `hooks/useAttendees.ts`, `hooks/useEvents.ts`; C `lib/format.ts`, `hooks/useEventTemplate.ts`                                                                                                                                                              |
| FE-1  | M `hooks/usePrintAttendee.ts`, `components/AttendeeTable.tsx`, `components/AttendeeRow.tsx`, `components/TemplateSelect.tsx`                                                                                                                                                                                                                                 |
| FE-2  | C `printer/zones.ts`, `hooks/useBadgeCanvas.ts`; M `printer/renderBadge.ts`, `components/TemplateEditor.tsx`, `components/BadgePrintPanel.tsx` (NOT the Template tab), `components/TemplateCard.tsx`, `hooks/useTemplates.ts`                                                                                                                                |
| FE-3  | M `hooks/useSheetSync.ts`                                                                                                                                                                                                                                                                                                                                    |
| FE-4  | C `components/ui/Dialog.tsx`, `components/ui/ConfirmDialog.tsx`, `components/EventDetailsFields.tsx`; M `components/EditEventDialog.tsx`, `ImportDialog.tsx`, `LinkSheetDialog.tsx`, `MoveToTrashDialog.tsx`, `PermanentDeleteDialog.tsx`, `SignOutDialog.tsx`, `EventCard.tsx`, `pages/OnboardingPage.tsx`, `pages/SettingsPage.tsx`, `pages/TrashPage.tsx` |
| FE-5  | D `public/icons.svg`, `src/assets/vite.svg`, `public/brand/itcomuz-icon.png`; C `public/brand/itcom-logo-horizontal.png`; M `pages/LandingPage.tsx` (logo `src` only), `index.html`                                                                                                                                                                          |
| OPS-1 | Production MongoDB (manual, **user approval required**)                                                                                                                                                                                                                                                                                                      |
| DOC-1 | M `frontend/docs/CLAUDE.md`, `backend/CLAUDE.md`                                                                                                                                                                                                                                                                                                             |

**Cross-lane contracts** (names later tasks rely on):

- Backend `POST /api/events/:id/sync-sheet` returns `{ added, updated, skipped, total, lastSyncedAt }` (BE-2). FE-3 reads `lastSyncedAt`.
- Backend `GET /api/events/trash` items include `purgeAt: string` (BE-2). FE-4 reads it.
- Backend `GET /api/events/:id/attendees` takes **no query params** and returns no `searchText` or `__v` (BE-1). FE-0 drops the params.
- FE-0 exports: `ApiError`, `api.listAttendees(eventId)`, `attendeesQueryOptions(eventId)`, `eventsQueryOptions`, `useEventTemplate(event)`, `fmtDate`, `todayLocal`, `daysUntil`, `TRASH_RETENTION_DAYS`. It also adds the types `SheetSyncResult.lastSyncedAt` and `AppEvent.purgeAt`.

---

## Task 0: Preflight (orchestrator only, do not delegate)

- [ ] **Step 1: Protect in-progress work.** `backend/` has uncommitted sheet-sync and trash changes, and `frontend/docs/` has modified files. Run `git -C backend status -s` and `git -C frontend status -s`. If anything is uncommitted, **stop and ask the user** to commit or stash it. Don't commit it for them.
- [ ] **Step 2: Sync and branch both repos.**

```bash
cd /Users/mn.afridi/Desktop/ItComPrint
for r in frontend backend; do git -C $r pull --ff-only && git -C $r switch -c perf/audit-fixes; done
```

- [ ] **Step 3: Baseline.** Run `cd backend && npm run verify`. It must end with 0 failures. Run `cd frontend && npm run validate && npm run build`. It must pass. Record both results. If the baseline already fails, stop and report.

---

## Task BE-1: Remove server-side search, trim the roster payload (B2, B3, B5)

**Why:** The UI filters rosters client-side. The `searchText` field and `{eventId, searchText}` index cost a write on every import and sync, and the field inflates the kiosk's biggest payload by about a third. Deleting `buildSearchText` also breaks the `event.services ↔ sheetSync.services` import cycle.

**Files:** see the ownership table (BE-1 row). Work in `/Users/mn.afridi/Desktop/ItComPrint/backend`.

**Interfaces:**

- Produces: `listAttendees(eventId: string)` (no query argument). `GET /events/:id/attendees` accepts no query params and omits `searchText` and `__v`.

- [ ] **Step 1: Update the harness first** in `scripts/verify.ts`. Replace the whole block from `// search by name` (≈ line 241) through the `'GET attendees?status=bogus → 400'` check (≈ line 269) with:

```ts
// full roster: search/filter are client-side, so no query params and no search index field
const roster = await afetch(`/events/${eventId}/attendees`).then((r) => r.json());
check('GET attendees → full roster of 2', roster.length === 2, roster);
check(
  'GET attendees → payload omits searchText and __v',
  roster.every((a: object) => !('searchText' in a) && !('__v' in a)),
  roster[0],
);
const jane = roster.find((a: { fullName: string }) => a.fullName === 'jane doe');
```

Then change `const janeId = searchJane[0]._id;` to `const janeId = jane._id;`. Replace the `// status filter reflects the print` block (the `printedList` fetch and its check) with:

```ts
// roster reflects the print
const rosterAfterPrint = await afetch(`/events/${eventId}/attendees`).then((r) => r.json());
check(
  'GET attendees after print → Jane printed, John not',
  rosterAfterPrint.filter((a: { printStatus: string }) => a.printStatus === 'printed').length === 1,
  rosterAfterPrint,
);
```

- [ ] **Step 2: Run the harness and confirm the new payload assertion fails.** Run `npm run verify`. Expected: `✗ GET attendees → payload omits searchText and __v`.

- [ ] **Step 3: Validator.** In `src/validators/attendee.validators.ts`, delete `listAttendeesQuerySchema` and `ListAttendeesQuery`. The file becomes:

```ts
import { z } from 'zod';
import { objectId } from '../utils/objectId';

export const attendeeIdParamSchema = z.object({ id: objectId });
```

- [ ] **Step 4: Service.** Replace `src/services/attendee.services.ts` lines 1-16 (the imports, `escapeRegex` and `listAttendees`) with:

```ts
import { AttendeeModel } from '../models/attendee.model';
import { AppError } from '../utils/AppError';

// Full roster: the kiosk searches and filters in memory. searchText is excluded because pre-cleanup docs still carry it.
export async function listAttendees(eventId: string) {
  return AttendeeModel.find({ eventId }).select('-searchText -__v').sort({ _id: 1 }).lean();
}
```

Keep `markPrinted` unchanged.

- [ ] **Step 5: Controller.** In `src/controllers/attendee.controllers.ts`: `const attendees = await attendeeService.listAttendees(String(req.params.id));`

- [ ] **Step 6: Route.** In `src/routes/event.routes.ts`, delete the `listAttendeesQuerySchema` import and the `validate(listAttendeesQuerySchema, 'query'),` line from the `/:id/attendees` route.

- [ ] **Step 7: Model.** In `src/models/attendee.model.ts`, remove `searchText: string;` from `AttendeeDoc`, remove `searchText: { type: String, default: '' },` from the schema, and delete `attendeeSchema.index({ eventId: 1, searchText: 1 });`. The `eventId` field index and the partial unique `{eventId, registrantId}` index stay.

- [ ] **Step 8: Writers.** In `src/services/event.services.ts`, delete the `buildSearchText` function (lines 14-16) and the `searchText: buildSearchText(a.fullName, a.extra),` line in `createEventWithAttendees`. In `src/services/sheetSync.services.ts`, delete `import { buildSearchText } from './event.services';` and the `searchText: buildSearchText(row.fullName, row.extra),` line inside `$set`.

- [ ] **Step 9: Verify.** Run `grep -rn "searchText\|buildSearchText\|ListAttendeesQuery" src scripts`. The only match should be the `.select('-searchText -__v')` line. Then run `npm run validate && npm run verify`. Expected: 0 failures.

- [ ] **Step 10: Commit**

```bash
git add -A src scripts
git commit -m "refactor(attendees): drop unused server-side search, trim roster payload

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task BE-2: Events service: scoped counts, rollback, trash purge job, sync timestamp (B1, B6, B8-author, B9, R5-backend, P2-backend)

**Why:** `withAttendeeCounts` scans every attendee ever stored on each events list. Upload-created events can be left empty if `insertMany` throws. The trash purge runs inside a GET. The kiosk needs `lastSyncedAt` from the sync call so it doesn't refetch the events list. The UI needs `purgeAt` so the 45-day retention lives in one place.

**Depends on:** BE-1 committed (same files).

**Interfaces:**

- Produces: `toAuthor(user: UserDoc): Author` in `utils/author.ts`. `purgeExpiredTrash(): Promise<number>` exported from `event.services.ts`. The sync response gains `lastSyncedAt: Date`. Trash list items gain `purgeAt: Date`.

- [ ] **Step 1: Update the harness first** in `scripts/verify.ts`.

(a) Next to `const { AttendeeModel: TrashAttendeeModel } = …` (≈ line 459), add:

```ts
const { purgeExpiredTrash } = await import('../src/services/event.services');
```

(b) After the existing `'GET /events excludes trashed event'` check, add:

```ts
const trashList = await afetch('/events/trash').then((r) => r.json());
const trashedItem = trashList.find((e: { _id: string }) => e._id === trashEventId);
check(
  'GET /events/trash → item has purgeAt 45 days after deletedAt',
  !!trashedItem &&
    new Date(trashedItem.purgeAt).getTime() - new Date(trashedItem.deletedAt).getTime() ===
      45 * 24 * 60 * 60 * 1000,
  trashedItem,
);
```

(c) Replace the two checks after `await TrashEventModel.findByIdAndUpdate(expiredEvent._id, { deletedAt: fortySixDaysAgo });` (the lazy purge checks) with:

```ts
const trashListAfterExpiry = await afetch('/events/trash').then((r) => r.json());
check(
  'GET /events/trash hides items past 45 days',
  !trashListAfterExpiry.some((e: { _id: string }) => e._id === expiredEvent._id),
  trashListAfterExpiry,
);
const purgedCount = await purgeExpiredTrash();
check('purgeExpiredTrash hard-deletes the expired event', purgedCount === 1, purgedCount);
const expiredAttendees = await TrashAttendeeModel.find({ eventId: expiredEvent._id }).lean();
check('purge cascades to attendees', expiredAttendees.length === 0, expiredAttendees);
```

Also update the comment above that block to `// purge job: an event trashed 46 days ago is hidden from trash, then hard-deleted by the job`.

(d) After `'POST /events/:id/sync-sheet → picks up the walk-in'`, add:

```ts
check(
  'POST /events/:id/sync-sheet → returns lastSyncedAt',
  typeof syncBody.lastSyncedAt === 'string' && !Number.isNaN(Date.parse(syncBody.lastSyncedAt)),
  syncBody,
);
```

- [ ] **Step 2: Run the harness and confirm the three new checks fail.** Run `npm run verify`. Expected: `✗` on purgeAt, `purgeExpiredTrash` (import undefined → throws; the run aborts at that point, which is acceptable here) and lastSyncedAt.

- [ ] **Step 3: Author util.** Create `src/utils/author.ts`:

```ts
import type { UserDoc } from '../models/user.model';

export interface Author {
  id: string;
  name: string;
  picture: string;
}

// Author identity is denormalized onto events (see event.model.ts).
export function toAuthor(user: UserDoc): Author {
  return { id: String(user._id), name: user.displayName, picture: user.picture };
}
```

In `src/controllers/event.controllers.ts`, import `toAuthor`. In `create`, use `eventService.createEventWithAttendees(req.body, toAuthor(req.user!))`. In `createFromSheet`, use `eventService.createEventFromSheet(req.body, toAuthor(req.user!))`. Delete the inline `{ id, name, picture }` objects. In `event.services.ts`, replace both `author: { id: string; name: string; picture: string }` parameter types with `author: Author` (`import type { Author } from '../utils/author';`).

- [ ] **Step 4: Scoped counts.** In `event.services.ts`, change `withAttendeeCounts` to match only the listed events:

```ts
async function withAttendeeCounts<T extends { _id: unknown }>(events: T[]) {
  const counts = await AttendeeModel.aggregate<{ _id: unknown; count: number; printed: number }>([
    // Scope to the listed events so cost tracks the screen, not total history.
    { $match: { eventId: { $in: events.map((e) => e._id) } } },
    {
      $group: {
```

Keep the rest of the function as is.

- [ ] **Step 5: Rollback helper.** In `event.services.ts`, add above `createEventWithAttendees`:

```ts
// Creation isn't transactional: undo a half-created event so no empty event is left behind.
async function deleteEventCascade(eventId: string) {
  await AttendeeModel.deleteMany({ eventId });
  await EventModel.findByIdAndDelete(eventId);
}
```

In `createEventWithAttendees`, wrap the insert:

```ts
try {
  await AttendeeModel.insertMany(docs);
} catch (err) {
  await deleteEventCascade(String(event._id));
  throw err;
}
```

In `createEventFromSheet`, replace the two delete lines in its `catch` with `await deleteEventCascade(String(event._id));`.

- [ ] **Step 6: Trash retention and purge job.** In `event.services.ts`, replace `TRASH_RETENTION_DAYS` and the whole `listTrash` function with:

```ts
const TRASH_RETENTION_MS = 45 * 24 * 60 * 60 * 1000;

const trashCutoff = () => new Date(Date.now() - TRASH_RETENTION_MS);

// Hard-deletes events trashed longer than the retention window. Runs on a timer from server.ts.
export async function purgeExpiredTrash(): Promise<number> {
  const expiredIds = await EventModel.find({ deletedAt: { $lte: trashCutoff() } }).distinct('_id');
  if (expiredIds.length === 0) return 0;
  await AttendeeModel.deleteMany({ eventId: { $in: expiredIds } });
  await EventModel.deleteMany({ _id: { $in: expiredIds } });
  return expiredIds.length;
}

export async function listTrash() {
  // $gt a Date also excludes null, so this lists only trashed events still inside the window.
  const events = await EventModel.find({ deletedAt: { $gt: trashCutoff() } })
    .sort({ deletedAt: -1 })
    .lean();
  const withCounts = await withAttendeeCounts(events);
  return withCounts.map((e) => ({
    ...e,
    purgeAt: new Date(e.deletedAt!.getTime() + TRASH_RETENTION_MS),
  }));
}
```

- [ ] **Step 7: Schedule the purge** in `src/server.ts`. Import `purgeExpiredTrash` from `./services/event.services`. Inside `main()`, after `registerShutdown(server);`, add:

```ts
schedulePurge();
```

and add this function below `main`:

```ts
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

function schedulePurge() {
  const run = () =>
    purgeExpiredTrash()
      .then((n) => n > 0 && console.log(`[trash] purged ${n} expired event(s)`))
      .catch((err) => console.error('[trash] purge failed', err));
  void run();
  setInterval(run, PURGE_INTERVAL_MS).unref(); // unref: never keeps a shutting-down process alive
}
```

- [ ] **Step 8: Sync timestamp.** In `src/services/sheetSync.services.ts` `syncEventAttendees`, change the return type and value, and ignore trashed events:

```ts
export async function syncEventAttendees(eventId: string): Promise<{
  added: number;
  updated: number;
  skipped: number;
  total: number;
  lastSyncedAt: Date;
}> {
  const event = await EventModel.findOne({ _id: eventId, deletedAt: null });
```

and change the final return to `return { added, updated, skipped, total: mapped.length + skipped, lastSyncedAt: event.lastSyncedAt! };`.

- [ ] **Step 9: Verify.** Run `npm run validate && npm run verify`. Expected: 0 failures. Then run `npm run smoke` (it boots the real `server.ts`, which now starts the purge timer). It must pass.

- [ ] **Step 10: Commit**

```bash
git add -A src scripts
git commit -m "perf(events): scope count aggregation, purge trash on a timer, return sync timestamp

Also rolls back upload-created events on insert failure and adds purgeAt to trash items.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task BE-3: Templates, auth and limits (B4, B7, B8-rest, B10)

**Why:** Field-key suggestions scan the whole attendees collection. The default template is checked on every list, and concurrent first loads can create two defaults. A few spots break the AppError convention. The body limit and row limit disagree.

**Depends on:** BE-2 committed (`server.ts`, `verify.ts`).

**Interfaces:**

- Produces: `ensureDefaultTemplate(): Promise<void>`, called once at boot. `GET /templates` no longer seeds.

- [ ] **Step 1: Update the harness first** in `scripts/verify.ts`.

(a) After `await connectDb();`, add:

```ts
const { ensureDefaultTemplate } = await import('../src/services/template.services');
await ensureDefaultTemplate(); // server.ts seeds at boot; the harness mirrors it
await ensureDefaultTemplate(); // idempotent: a second call must not create a duplicate
```

(b) After the `GET /health` check, add:

```ts
const badOrigin = await fetch(`${base}/health`, { headers: { Origin: 'https://evil.example' } });
check('request from a disallowed CORS origin → 403', badOrigin.status === 403, badOrigin.status);
```

- [ ] **Step 2: Run the harness and confirm the new checks fail.** Run `npm run verify`. Expected: the import works (the function exists), but `✗ disallowed CORS origin → 403` (currently 500).

- [ ] **Step 3: Default template seed.** In `src/models/badgeTemplate.model.ts`, change `isDefault` to `{ type: Boolean, default: false }` (drop `index: true`), and add below the schema:

```ts
// At most one default template, even if two boots race the seed.
badgeTemplateSchema.index(
  { isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true }, name: 'one_default_template' },
);
```

In `src/services/template.services.ts`, replace `ensureDefaultTemplate` and `listTemplates` with:

```ts
// Idempotent upsert. Called once at boot (server.ts), not on every request.
export async function ensureDefaultTemplate(): Promise<void> {
  await BadgeTemplateModel.updateOne(
    { isDefault: true },
    {
      $setOnInsert: {
        name: 'Default badge',
        isDefault: true,
        labelWidthMm: 80,
        labelHeightMm: 60,
        zones: DEFAULT_ZONES,
      },
    },
    { upsert: true },
  );
}

export async function listTemplates() {
  return BadgeTemplateModel.find().sort({ isDefault: -1, createdAt: 1 }).lean();
}
```

In `src/server.ts`, import `ensureDefaultTemplate` and call `await ensureDefaultTemplate();` right after `await connectDb();`.

- [ ] **Step 4: Scoped field keys.** In `template.services.ts`, replace `listFieldKeys` with:

```ts
const FIELD_KEY_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

// Distinct extra keys from recently created, non-trashed events: bounded cost as history grows.
export async function listFieldKeys(): Promise<string[]> {
  const since = new Date(Date.now() - FIELD_KEY_LOOKBACK_MS);
  const eventIds = await EventModel.find({ deletedAt: null, createdAt: { $gte: since } }).distinct(
    '_id',
  );
  const rows = await AttendeeModel.aggregate<{ _id: string }>([
    { $match: { eventId: { $in: eventIds } } },
    { $project: { kv: { $objectToArray: '$extra' } } },
    { $unwind: '$kv' },
    { $group: { _id: '$kv.k' } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => r._id);
}
```

(Use `createdAt`, not `date`: the harness creates events with past `date` values, but `createdAt` is always now.)

- [ ] **Step 5: Auth convention.** In `src/services/auth.services.ts`, change `updateDisplayName` to throw instead of returning null:

```ts
export async function updateDisplayName(id: string, displayName: string): Promise<UserDoc> {
  const user = await UserModel.findById(id);
  if (!user) throw new AppError(404, 'User not found');
```

(Keep the rest.) In `src/controllers/auth.controllers.ts` `updateMe`, change `toPublicUser(user!)` to `toPublicUser(user)`. In `src/models/user.model.ts`, change `googleId` to `{ type: String, required: true, unique: true }` (`unique` already creates the index).

- [ ] **Step 6: CORS and limits.** In `src/app.ts`, import `AppError` from `./utils/AppError` and change the CORS rejection to `callback(new AppError(403, \`Origin ${origin} not allowed\`));`. Change the body parser to `app.use(express.json({ limit: '10mb' })); // large spreadsheet imports`. In `src/validators/event.validators.ts`, change `.max(50_000, 'Too many attendees in a single import')`to`.max(20_000, 'Too many attendees — split the spreadsheet into smaller imports')`.

- [ ] **Step 7: Verify.** Run `npm run validate && npm run verify && npm run smoke`. Expected: all pass. The existing `'GET /templates twice → exactly one default'` style checks (≈ lines 320-335) must still pass.

- [ ] **Step 8: Commit**

```bash
git add -A src scripts
git commit -m "perf(templates): seed default once at boot, scope field keys; align auth/CORS/limits

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task FE-0: Frontend foundation: global toasts, readable errors, shared helpers (U1, U2, D1-api, R3-hook, R5-lib)

**Why:** Toasts only render inside the kiosk, so every dashboard, settings, templates and trash message is invisible. Errors show raw JSON. Wave-B tasks need the shared helpers created here.

Work in `/Users/mn.afridi/Desktop/ItComPrint/frontend`.

**Interfaces:**

- Produces (exact):
  - `lib/api.ts`: `export class ApiError extends Error { status: number }`. `api.listAttendees(eventId: string): Promise<Attendee[]>`. `api.getTemplate` removed.
  - `hooks/useAttendees.ts`: `attendeesQueryOptions(eventId: string)` and `useAttendees(eventId: string | null)`.
  - `hooks/useEvents.ts`: `eventsQueryOptions` (key `['events']`).
  - `hooks/useEventTemplate.ts`: `useEventTemplate(event: Pick<AppEvent, 'templateId'>): { templates: BadgeTemplate[]; template: BadgeTemplate | undefined; defaultId: string }`.
  - `lib/format.ts`: `fmtDate(iso: string): string`, `todayLocal(): string`, `daysUntil(iso: string): number`, `TRASH_RETENTION_DAYS = 45`.
  - `types.ts`: `SheetSyncResult.lastSyncedAt: string`, `AppEvent.purgeAt?: string`.

- [ ] **Step 1: Global toast.** In `src/App.tsx`, `import { Toast } from './components/Toast';` and render `<Toast />` right after `</Routes>` (still inside `<BrowserRouter>`). In `src/pages/KioskPage.tsx`, delete the `Toast` import and the `<Toast />` element.

- [ ] **Step 2: Readable API errors.** In `src/lib/api.ts`, replace `request` (lines 13-24) with:

```ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Used when the server sends no usable `message` (e.g. auth guard 401, Zod 400, body-parser 413).
const FALLBACK_MESSAGES: Record<number, string> = {
  400: 'Some details look invalid — check them and try again.',
  401: 'Your session expired — sign in again.',
  413: 'That spreadsheet is too large — split it into smaller files.',
};

async function toApiError(res: Response): Promise<ApiError> {
  let message: string | undefined;
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === 'string') message = body.message;
  } catch {
    // non-JSON body (proxy error page, empty 5xx)
  }
  // body-parser's 413 message ("request entity too large") isn't operator-friendly.
  if (res.status === 413) message = undefined;
  return new ApiError(
    res.status,
    message ?? FALLBACK_MESSAGES[res.status] ?? `Something went wrong (${res.status}) — try again.`,
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
```

In the same file:

- Replace `listAttendees` with `listAttendees: (eventId: string) => request<Attendee[]>(\`/events/${eventId}/attendees\`),`
- Delete `getTemplate`.
- In `me`, change `if (!res.ok) throw new Error(\`API ${res.status}\`);`to`if (!res.ok) throw await toApiError(res);`
- Replace `logout` with `logout: () => request<void>('/auth/logout', { method: 'POST' }),` and delete its comment.

`lib/errors.ts` needs no change, because `errMessage` already reads `error.message`.

- [ ] **Step 3: Types.** In `src/types.ts`, add `purgeAt?: string; // trash listing only` to `AppEvent`. Replace `SheetSyncResult` with:

```ts
export interface SheetSyncResult {
  added: number;
  updated: number;
  skipped: number;
  total: number;
  lastSyncedAt: string;
}
```

- [ ] **Step 4: Shared query options.** Replace `src/hooks/useAttendees.ts` with:

```ts
import { queryOptions, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/** One definition of the roster query, shared by the table and the live-sync poller. */
export const attendeesQueryOptions = (eventId: string) =>
  queryOptions({ queryKey: ['attendees', eventId], queryFn: () => api.listAttendees(eventId) });

/**
 * Loads the full attendee list for an event. Search, status filtering and
 * segment counts are derived client-side — instant under pressure, no round-trip per keystroke.
 */
export function useAttendees(eventId: string | null) {
  return useQuery({ ...attendeesQueryOptions(eventId ?? ''), enabled: !!eventId });
}
```

In `src/hooks/useEvents.ts`, change the import to `import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';` and replace `useEvents` with:

```ts
export const eventsQueryOptions = queryOptions({ queryKey: ['events'], queryFn: api.listEvents });

export function useEvents() {
  return useQuery({ ...eventsQueryOptions, refetchOnWindowFocus: true });
}
```

- [ ] **Step 5: Event template hook.** Create `src/hooks/useEventTemplate.ts`:

```ts
import { useTemplates } from './useTemplates';
import type { AppEvent } from '../types';

/** The template an event prints with: its own templateId, else the default. */
export function useEventTemplate(event: Pick<AppEvent, 'templateId'>) {
  const { data: templates = [] } = useTemplates();
  const defaultTemplate = templates.find((t) => t.isDefault);
  const template = templates.find((t) => t._id === event.templateId) ?? defaultTemplate;
  return { templates, template, defaultId: defaultTemplate?._id ?? '' };
}
```

- [ ] **Step 6: Format helpers.** Create `src/lib/format.ts`:

```ts
const DAY_MS = 24 * 60 * 60 * 1000;

/** Mirrors the backend's retention window; per-item countdowns use the server's purgeAt. */
export const TRASH_RETENTION_DAYS = 45;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Today as YYYY-MM-DD in local time (toISOString is UTC: yesterday before 05:00 in Tashkent). */
export function todayLocal(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Whole days until an ISO timestamp, never negative. */
export function daysUntil(iso: string): number {
  return Math.max(Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS), 0);
}
```

- [ ] **Step 7: Dead toast API.** In `src/store/toastStore.ts`, delete `hide` from the interface and the store.

- [ ] **Step 8: Verify.** Run `npm run validate && npm run build`. It must pass. (`useAttendees` callers compile unchanged.) Manual check with `npm run dev` and the backend running: on `/app/settings`, change one letter of the name and save. The "Name updated" toast must now appear. Stop the backend and trigger any action: the toast must show a readable message, not `API …: {json}`.

- [ ] **Step 9: Commit**

```bash
git add -A src
git commit -m "fix(ui): global toast outlet and readable API errors; add shared query/format helpers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**Wave-B setup (orchestrator):** Create one worktree per Wave-B task from this commit, e.g. `git -C frontend worktree add ../fe-1 -b perf/fe-1`, and run `npm install` in each. When all five finish, merge them into `perf/audit-fixes` in order FE-5, FE-3, FE-1, FE-2, FE-4. Files are disjoint, so the merges must be clean. Run `npm run validate && npm run build` after the final merge.

---

## Task FE-1: Kiosk list and printing: instant rows, cache patching, resilient batch (P1, P3, P4, U6, R3-table)

**Why:** Each print refetches every cached roster. Search waits 300 ms and re-renders every row. PNG encoding runs even on real hardware. Batch printing aborts on the first failure with no progress.

**Depends on:** FE-0. **Files:** FE-1 row only.

**Interfaces:**

- Consumes: `useEventTemplate(event)`, `api.printAttendee(id): Promise<Attendee>` (FE-0).
- Produces: `usePrintAttendee()` (same signature). `AttendeeRow` is now `memo`-wrapped (same props). `TemplateSelect` props become `{ event: AppEvent }` (the `templates` prop is removed).

- [ ] **Step 1: Cache patch and hardware-aware preview** in `src/hooks/usePrintAttendee.ts`. Keep the imports (add `import { errMessage } from '../lib/errors';`) and `PrintRequest`. Add this helper above the hook:

```ts
// The label already exists physically, so retry the status save once before reporting a mismatch.
async function markPrinted(attendee: Attendee): Promise<Attendee> {
  try {
    return await api.printAttendee(attendee._id);
  } catch {
    try {
      return await api.printAttendee(attendee._id);
    } catch (e) {
      throw new Error(
        `${attendee.fullName}'s badge printed, but saving that failed (${errMessage(e, 'network error')}) — it may still show "Not printed".`,
      );
    }
  }
}
```

Inside `mutationFn`:

- Change `const previewDataUrl = canvas.toDataURL('image/png');` to `const previewDataUrl = adapter.kind === 'preview' ? canvas.toDataURL('image/png') : ''; // only the preview tray shows it`.
- Change `return api.printAttendee(attendee._id);` to `return markPrinted(attendee);`.

Replace `onSuccess` with:

```ts
    onSuccess: (updated) => {
      // Patch the one row instead of refetching every cached roster.
      qc.setQueryData<Attendee[]>(['attendees', updated.eventId], (list) =>
        list?.map((a) => (a._id === updated._id ? updated : a)),
      );
      // Dashboard counts are now stale; refresh them on next view, not now.
      void qc.invalidateQueries({ queryKey: ['events'], exact: true, refetchType: 'none' });
      if (usePrinterStore.getState().adapter.kind === 'webusb') toast('Sent to printer');
    },
```

- [ ] **Step 2: Memoized row.** In `src/components/AttendeeRow.tsx`, change `import type { ReactNode } from 'react';` to `import { memo, type ReactNode } from 'react';`. Change `export function AttendeeRow({` to `export const AttendeeRow = memo(function AttendeeRow({`, and close the component with `});` instead of `}`.

- [ ] **Step 3: TemplateSelect uses the shared hook.** In `src/components/TemplateSelect.tsx`, import `useEventTemplate` from `'../hooks/useEventTemplate'`. Change props to `{ event }: { event: AppEvent }` (drop `BadgeTemplate` from the type import). Replace `const defaultId = templates.find((t) => t.isDefault)?._id ?? '';` with `const { templates, defaultId } = useEventTemplate(event);`.

- [ ] **Step 4: AttendeeTable (search, template, toggle, keyboard).** In `src/components/AttendeeTable.tsx`:
  - Imports: `import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';`. Remove the `useTemplates` import and add `import { useEventTemplate } from '../hooks/useEventTemplate';`.
  - Replace the `useTemplates` + `activeTemplate` lines with `const { template: activeTemplate } = useEventTemplate(event);`.
  - Delete `search` state, `searchDebounceRef` and the debounce `useEffect`. Add `const search = useDeferredValue(searchInput); // input stays instant; filtering yields to typing`.
  - Replace the `visible` memo with:

```ts
// Built once per roster, not per keystroke.
const haystacks = useMemo(() => new Map(attendees.map((a) => [a._id, haystack(a)])), [attendees]);

const visible = useMemo(() => {
  const q = search.trim().toLowerCase();
  return attendees.filter((a) => {
    if (filter === 'printed' && !isPrinted(a)) return false;
    if (filter === 'notprinted' && isPrinted(a)) return false;
    if (q && !haystacks.get(a._id)!.includes(q)) return false;
    return true;
  });
}, [attendees, haystacks, search, filter]);
```

- Make `toggle` stable so memoized rows skip re-renders: `const toggle = useCallback((id: string) => { setSelected((prev) => { …unchanged body… }); }, []);`
- In the keydown handler, replace the `tag` logic with:

```ts
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
      if (e.key === '/' && !typing) {
```

- Change `<TemplateSelect event={event} templates={templates} />` to `<TemplateSelect event={event} />`.

- [ ] **Step 5: Resilient batch print** in `AttendeeTable.tsx`. Replace `batchRunning` state with `const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);` and replace `batchPrint` with:

```ts
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
```

Update the batch button: `disabled={!!batch}` and label `{batch ? \`Printing ${Math.min(batch.done + 1, batch.total)}/${batch.total}…\` : \`Print ${selected.size} ${selected.size === 1 ? 'badge' : 'badges'}\`}`.

- [ ] **Step 6: Verify.** Run `npm run validate && npm run build`. Manual check (dev server, `VITE_PRINTER_MODE=preview`):
  1. Open DevTools → Network on a kiosk. Print one attendee: exactly **one** `POST …/print`, **no** `GET …/attendees`, and the row flips to "Printed" immediately.
  2. Type in search: results update with no perceptible delay. Highlighting still works.
  3. Select 3 attendees and batch print: the button counts `Printing 1/3…` up to `3/3`, the toast says `3 badges printed`, and the selection clears.
  4. With the backend stopped mid-batch, failed rows stay selected and the toast shows the counts.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "perf(kiosk): patch printed row in cache, instant search, resilient batch print

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task FE-2: Badge preview is the real print, single zone logic (U3, U4, R2, R3-panel, B4-client)

**Why:** The kiosk panel previews with DOM text while printing uses the canvas, so wrapping and overflow only show on paper. The panel's draft is copied once, so a template switch prints the old layout. Zone text and zone defaults are duplicated.

**Depends on:** FE-0. **Files:** FE-2 row only.

**Hard constraint (user decision):** In `BadgePrintPanel.tsx`, do **not** modify the Template tab: the JSX under `tab === 'template'` and the functions `patchZone`, `moveZone`, `addZone` and `saveTemplate`. Changes are limited to imports, template resolution, draft seeding, the merged attendee, the preview block and `handlePrint`.

**Interfaces:**

- Consumes: `useEventTemplate(event)` (FE-0).
- Produces: `printer/zones.ts` → `resolveZoneText(zone, attendee): string`, `newFieldZone(): TemplateZone`, `newStaticZone(): TemplateZone`. `hooks/useBadgeCanvas.ts` → `useBadgeCanvas(attendee, template, delayMs?) : { canvasRef: RefObject<HTMLCanvasElement | null> }`.

- [ ] **Step 1: Zone module.** Create `src/printer/zones.ts`:

```ts
import type { Attendee, TemplateZone } from '../types';

type ZoneSource = Pick<Attendee, 'fullName' | 'extra'>;

/** The text a zone prints for an attendee — the single definition used by print and every preview. */
export function resolveZoneText(zone: TemplateZone, attendee: ZoneSource): string {
  if (zone.type === 'static') return zone.staticText ?? '';
  if (zone.field === 'fullName') return attendee.fullName;
  return attendee.extra[zone.field ?? ''] ?? '';
}

const baseZone = { fontFamily: 'Inter', bold: false, align: 'center', hidden: false } as const;

export const newFieldZone = (): TemplateZone => ({
  ...baseZone,
  id: crypto.randomUUID(),
  type: 'field',
  field: 'fullName',
  fontSize: 16,
});

export const newStaticZone = (): TemplateZone => ({
  ...baseZone,
  id: crypto.randomUUID(),
  type: 'static',
  staticText: '',
  fontSize: 14,
});
```

In `src/printer/renderBadge.ts`, delete the private `resolveZoneText` function (lines 45-52) and add `import { resolveZoneText } from './zones';`.

- [ ] **Step 2: Canvas preview hook.** Create `src/hooks/useBadgeCanvas.ts`:

```ts
import { useEffect, useRef } from 'react';
import { renderBadgeToCanvas } from '../printer/renderBadge';
import type { Attendee, BadgeTemplate } from '../types';

/**
 * Draws the exact print raster into a visible canvas (debounced), so previews are
 * pixel-identical to the label. Pass stable (memoized) inputs to avoid redundant renders.
 */
export function useBadgeCanvas(
  attendee: Pick<Attendee, 'fullName' | 'extra'> | null,
  template: BadgeTemplate | null,
  delayMs = 150,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!attendee || !template) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rendered = await renderBadgeToCanvas(attendee, template);
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        canvas.width = rendered.width;
        canvas.height = rendered.height;
        canvas.getContext('2d')!.drawImage(rendered, 0, 0);
      } catch {
        // fonts may not be ready on first paint — the next input change retries
      }
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [attendee, template, delayMs]);

  return { canvasRef };
}
```

- [ ] **Step 3: TemplateEditor uses the shared pieces.** In `src/components/TemplateEditor.tsx`:
  - Change the React import to `import { useState, useRef } from 'react';`.
  - Delete the local `newFieldZone` and `newStaticZone` (lines 24-44). Add `import { newFieldZone, newStaticZone, resolveZoneText } from '../printer/zones';` and `import { useBadgeCanvas } from '../hooks/useBadgeCanvas';`. Remove `renderBadgeToCanvas` from the renderBadge import.
  - Delete `canvasRef`, `debounceRef`, `updatePreview` and its `useEffect` (lines 70-71 and 80-100). Add `const { canvasRef } = useBadgeCanvas(SAMPLE_ATTENDEE, draft);` after the `useState` hooks.
  - Replace the `sampleText` ternary (≈ lines 385-390) with `const sampleText = resolveZoneText(norm, SAMPLE_ATTENDEE);`. Unknown fields now show the existing faint italic field-name placeholder, which is intended.

- [ ] **Step 4: TemplateCard uses resolveZoneText.** In `src/components/TemplateCard.tsx`, import `resolveZoneText` from `'../printer/zones'`. Replace the `text` ternary with:

```ts
// Thumbnails show the field key when the sample has no value, so the card isn't blank.
const text = resolveZoneText(z, SAMPLE_ATTENDEE) || (z.type === 'field' ? (z.field ?? '') : '');
```

- [ ] **Step 5: BadgePrintPanel (resolution, draft seeding, canvas preview).** In `src/components/BadgePrintPanel.tsx`:
  - Imports: `import { useMemo, useState } from 'react';`. Change the useTemplates import to `import { useUpdateTemplate, useTemplateFieldKeys } from '../hooks/useTemplates';`. Add `import { useEventTemplate } from '../hooks/useEventTemplate';` and `import { useBadgeCanvas } from '../hooks/useBadgeCanvas';`.
  - Replace `const { data: templates = [] } = useTemplates();` and the `const template = …` lines with `const { template } = useEventTemplate(event);`.
  - Replace the draft-init block (`// Initialize draft when template resolves…` and its `if`) with:

```ts
// Re-seed on template switch or remote save so printing never uses a stale layout (render-phase update).
const templateKey = template ? `${template._id}:${template.updatedAt ?? ''}` : null;
const [draftKey, setDraftKey] = useState<string | null>(null);
if (template && templateKey !== draftKey) {
  setDraftKey(templateKey);
  setDraft({ ...template, zones: template.zones.map(normalizeLegacyZone) });
}
```

- Replace the `mergedAttendee()` function with a memo, and delete `previewZones`:

```ts
// Attendee with field overrides applied — memoized so the canvas preview only re-renders on real changes
const merged = useMemo(() => {
  const { __fullName__: fullName, ...extraOverrides } = overrides;
  return {
    ...attendee,
    fullName: fullName ?? attendee.fullName,
    extra: { ...attendee.extra, ...extraOverrides },
  };
}, [attendee, overrides]);

const { canvasRef } = useBadgeCanvas(merged, effectiveTemplate, 120);
```

- In `handlePrint`, change `attendee: mergedAttendee(),` to `attendee: merged,`.
- Replace the whole `{effectiveTemplate ? ( <div …aspectRatio…> …zones… </div> ) : (` branch (the first branch of the "Live badge preview" block) with:

```tsx
        {effectiveTemplate ? (
          <canvas
            ref={canvasRef}
            aria-label={`Badge preview for ${merged.fullName}`}
            className="h-auto w-full max-w-[280px] rounded-md border border-line bg-white shadow-[0_8px_24px_rgba(0,0,0,.10)]"
            style={{
              aspectRatio: `${effectiveTemplate.labelWidthMm} / ${effectiveTemplate.labelHeightMm}`,
            }}
          />
        ) : (
```

- Confirm with `git diff src/components/BadgePrintPanel.tsx` that no line inside the Template tab or its four handlers changed.

- [ ] **Step 6: Field-key cache.** In `src/hooks/useTemplates.ts`, make `useTemplateFieldKeys` read `useQuery({ queryKey: ['template-field-keys'], queryFn: api.templateFieldKeys, staleTime: 5 * 60_000 })`.

- [ ] **Step 7: Verify.** Run `npm run validate && npm run build`. Manual check:
  1. Kiosk → open an attendee with a long two-word name. The preview shows the name split across two lines exactly like a downloaded preview-tray badge. Compare with Print → preview tray image; they must match.
  2. Edit the Full Name field in the Fields tab: the canvas updates within about 0.1 s.
  3. With the panel open, switch the Template dropdown to another template and print. The tray badge uses the **new** template.
  4. Template tab: change a font size and save. It still works as before.
  5. `/app/templates` editor: the right-hand print simulation still updates, and adding field or text zones still works.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "fix(kiosk): canvas preview matches print, reseed draft on template change; share zone logic

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task FE-3: Live stations for sheet-linked events (U10, P2)

**Why (user decision):** Stations on a sheet-linked event must see each other's prints and edits. Today the kiosk only refreshes the roster when the sheet adds rows. It also refetches the whole events list every 30 s just to show `lastSyncedAt`, ignores sheet edits (`updated`), and keeps polling in hidden tabs.

**Approach:** React Query polls a key at the fastest interval of any mounted observer. `useSheetSync` (already called by `AttendeeTable` with `enabled = !!event.sheetId`) adds two polling observers on the existing keys, so no call sites change:

- `['attendees', eventId]` every **10 s**: prints from other stations.
- `['events']` every **30 s**: event rename and template switches from other stations (cheap after BE-2's scoped aggregation).

Polling pauses automatically in background tabs (`refetchIntervalInBackground` defaults to false). The sheet pull stays at 30 s, skips hidden tabs, and patches `lastSyncedAt` into the cache.

**Depends on:** FE-0 (query options, `SheetSyncResult.lastSyncedAt`). End-to-end behavior also needs BE-2 deployed locally. **Files:** `src/hooks/useSheetSync.ts` only.

**Interfaces:**

- Consumes: `attendeesQueryOptions(eventId)`, `eventsQueryOptions`, `api.syncEventSheet(eventId): Promise<SheetSyncResult>`.
- Produces: `useSheetSync(eventId: string | null, enabled: boolean): { syncNow: () => void; isSyncing: boolean }` (unchanged signature).

- [ ] **Step 1: Replace `src/hooks/useSheetSync.ts`** with:

```ts
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { attendeesQueryOptions } from './useAttendees';
import { eventsQueryOptions } from './useEvents';
import type { AppEvent } from '../types';

const SHEET_PULL_MS = 30_000;
const ROSTER_POLL_MS = 10_000; // other stations' prints
const EVENTS_POLL_MS = 30_000; // other stations' renames / template switches

/**
 * Keeps a sheet-linked kiosk live: pulls the Google Sheet into the roster and polls
 * the shared roster/event caches so every station sees each other's prints and edits.
 * Background ticks are silent on failure; only syncNow() toasts, since it's deliberate.
 */
export function useSheetSync(eventId: string | null, enabled: boolean) {
  const qc = useQueryClient();
  const live = enabled && !!eventId;

  // Extra observers on the shared keys — React Query polls at the fastest mounted interval.
  useQuery({
    ...attendeesQueryOptions(eventId ?? ''),
    enabled: live,
    refetchInterval: ROSTER_POLL_MS,
    refetchOnWindowFocus: true,
  });
  useQuery({
    ...eventsQueryOptions,
    enabled: live,
    refetchInterval: EVENTS_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const mutation = useMutation({
    mutationFn: () => api.syncEventSheet(eventId!),
    onSuccess: (result) => {
      if (result.added > 0 || result.updated > 0) {
        void qc.invalidateQueries({ queryKey: ['attendees', eventId] });
      }
      // Patch the timestamp in place instead of refetching the whole events list.
      qc.setQueryData<AppEvent[]>(['events'], (events) =>
        events?.map((e) => (e._id === eventId ? { ...e, lastSyncedAt: result.lastSyncedAt } : e)),
      );
    },
  });
  const mutateRef = useRef(mutation.mutate);
  const isPendingRef = useRef(mutation.isPending);
  useEffect(() => {
    mutateRef.current = mutation.mutate;
    isPendingRef.current = mutation.isPending;
  });

  useEffect(() => {
    if (!live) return;
    const tick = () => {
      if (document.hidden || isPendingRef.current) return; // hidden tab, or previous pull in flight
      mutateRef.current();
    };
    tick();
    const id = setInterval(tick, SHEET_PULL_MS);
    return () => clearInterval(id);
  }, [live]);

  return {
    syncNow: () =>
      mutation.mutate(undefined, {
        onError: (err) => toast(errMessage(err, "Couldn't sync the sheet — try again.")),
      }),
    isSyncing: mutation.isPending,
  };
}
```

- [ ] **Step 2: Verify.** Run `npm run validate && npm run build`. Manual check (backend on the BE-2 commit, a sheet-linked event, two browser windows side by side on the same kiosk URL):
  1. Print an attendee in window A. Window B shows "Printed" within about 10 s without a reload.
  2. Change the Template dropdown in A. B's dropdown updates within about 30 s.
  3. Edit a name in the Google Sheet. It appears on both stations within about 30-40 s. (Before this task it never appeared.)
  4. DevTools → Network in B: `GET …/attendees` about every 10 s, `GET /events` about every 30 s, `POST …/sync-sheet` about every 30 s. Switch to another browser tab for a minute: requests stop. Switch back: an immediate refetch.
  5. An **XLSX (non-sheet)** event kiosk makes none of these polling requests.

- [ ] **Step 3: Commit**

```bash
git add -A src
git commit -m "feat(kiosk): live cross-station roster and event updates for sheet-linked events

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task FE-4: Dialogs and forms: one modal shell, import hardening, name fields, trash dates (R1, R4, U7, U8, R5-ui)

**Why:** Six copies of the same modal shell, none closable with Escape or exposed as dialogs to assistive tech. The import dialog fails silently and advertises a drop zone that doesn't exist. Name fields snap back when cleared. Date formatting and the default date (UTC) are duplicated.

**Depends on:** FE-0. **Files:** FE-4 row only.

**Interfaces:**

- Consumes: `fmtDate`, `todayLocal`, `daysUntil`, `TRASH_RETENTION_DAYS`, `AppEvent.purgeAt` (FE-0).
- Produces: `Dialog`, `ConfirmDialog`, `EventDetailsFields` (props below). The public props of the six existing dialogs stay unchanged, so their callers don't change.

- [ ] **Step 1: Dialog shell.** Create `src/components/ui/Dialog.tsx`:

```tsx
import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

const SIZES = { sm: 'max-w-[380px]', md: 'max-w-[420px]', lg: 'max-w-[520px]' } as const;

/**
 * Modal shell. Portalled to <body> because a transformed ancestor (the sliding sidebar)
 * would trap `fixed`. Escape and backdrop close it unless `busy` (mid-save).
 */
export function Dialog({
  title,
  description,
  size = 'md',
  busy = false,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  size?: keyof typeof SIZES;
  busy?: boolean;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return createPortal(
    <div
      onClick={() => !busy && onClose()}
      className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/55 p-4 backdrop-blur-[4px] sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'animate-dlg-in my-auto w-full rounded-2xl bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,.3)] sm:p-7',
          SIZES[size],
        )}
      >
        <div id={titleId} className="font-display text-xl font-bold text-ink">
          {title}
        </div>
        {description && <div className="mt-1.5 text-sm text-muted">{description}</div>}
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Confirm dialog.** Create `src/components/ui/ConfirmDialog.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { toast } from '../../store/toastStore';
import { errMessage } from '../../lib/errors';

/** Title + message + Cancel/Confirm. The caller's onConfirm does the work and any success toast. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pendingLabel,
  errorFallback,
  size = 'md',
  onConfirm,
  onClose,
}: {
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  errorFallback: string;
  size?: 'sm' | 'md';
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      toast(errMessage(err, errorFallback));
      setPending(false);
    }
  }

  return (
    <Dialog
      title={title}
      description={description}
      size={size}
      busy={pending}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={pending}
            className="h-11 rounded-[10px] px-5 text-sm"
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={pending}
            className="h-11 rounded-[10px] px-6 text-sm"
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
```

- [ ] **Step 3: The three confirmations become thin wrappers.** Their public props stay the same. Replace `src/components/SignOutDialog.tsx` with the example below, then build the other two the same way:

```tsx
import { useLogout } from '../hooks/useAuth';
import { ConfirmDialog } from './ui/ConfirmDialog';

export function SignOutDialog({ onClose }: { onClose: () => void }) {
  const logout = useLogout();
  return (
    <ConfirmDialog
      size="sm"
      title="Sign out?"
      description="You'll be signed out on this device and need to sign in again to continue."
      confirmLabel="Sign out"
      pendingLabel="Signing out…"
      errorFallback="Couldn't sign out — try again."
      onConfirm={() => logout.mutateAsync()}
      onClose={onClose}
    />
  );
}
```

- `MoveToTrashDialog.tsx`: `useTrashEvent`. title `"Move to trash?"`. description `` `"${event.name}" and its ${event.attendeeCount ?? 0} attendee(s) will move to Trash and stay there for ${TRASH_RETENTION_DAYS} days before being permanently deleted. You can restore it any time before then.` `` (import `TRASH_RETENTION_DAYS` from `'../lib/format'`). confirmLabel `"Move to trash"`, pendingLabel `"Moving…"`, errorFallback `"Couldn't move that event to trash — try again."`. `onConfirm={async () => { await trashEvent.mutateAsync(event._id); toast('Event moved to trash'); }}`.
- `PermanentDeleteDialog.tsx`: `usePermanentDeleteEvent`. title `"Delete forever?"`. description `` `"${event.name}" and its ${event.attendeeCount ?? 0} attendee(s) will be permanently deleted. This cannot be undone.` ``. confirmLabel `"Delete forever"`, pendingLabel `"Deleting…"`, errorFallback `"Couldn't delete that event — try again."`. Success toast `'Event permanently deleted'`.

(`Dialog` portals, so the old SignOut portal comment is no longer needed.)

- [ ] **Step 4: Shared event fields.** Create `src/components/EventDetailsFields.tsx`:

```tsx
import { Input } from './ui/Input';

/** Event name + date pair used by every create/edit event dialog. */
export function EventDetailsFields({
  name,
  date,
  onNameChange,
  onDateChange,
}: {
  name: string;
  date: string;
  onNameChange: (value: string) => void;
  onDateChange: (value: string) => void;
}) {
  return (
    <div className="mt-[18px] grid grid-cols-2 gap-3.5">
      <label className="flex flex-col gap-1.5">
        <span className="font-display text-xs font-semibold text-ink-3">Event name</span>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. DevFest Tashkent"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-display text-xs font-semibold text-ink-3">Event date</span>
        <Input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
      </label>
    </div>
  );
}
```

- [ ] **Step 5: EditEventDialog on the shell.** In `src/components/EditEventDialog.tsx`, keep the state, `canSave` and `handleSave`, and remove the `Input` import. Return `<Dialog title="Edit event" busy={updateEvent.isPending} onClose={onClose} footer={<>…the existing Cancel and Save changes buttons, unchanged…</>}>` with a single child `<EventDetailsFields name={name} date={date} onNameChange={setName} onDateChange={setDate} />`. Delete the old backdrop and panel `<div>`s and both `<label>` blocks.

- [ ] **Step 6: LinkSheetDialog on the shell.** In `src/components/LinkSheetDialog.tsx`, initialize the date with `useState(todayLocal)`. Wrap the content in `<Dialog size="lg" title="Link a Google Sheet" description="The roster syncs automatically from this sheet — new registrants appear on the kiosk within seconds." busy={createFromSheet.isPending} onClose={onClose} footer={…the existing Cancel + Link sheet buttons…}>`. Replace the name/date grid with `<EventDetailsFields name={eventName} date={eventDate} onNameChange={setEventName} onDateChange={setEventDate} />`. Keep the Sheet-link `<label>` and the sharing hint as children. Delete the old backdrop and panel `<div>`s.

- [ ] **Step 7: ImportDialog: shell, error handling, real drag-and-drop.** In `src/components/ImportDialog.tsx`:
  - Date: `useState(todayLocal)`. Add `const [dragging, setDragging] = useState(false);`. Add imports `errMessage`, `todayLocal`, `Dialog`, `EventDetailsFields`, and remove `Input`.
  - Replace `handleFile` with:

```ts
function handleFile(file: File) {
  setFileName(file.name);
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target?.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false });
      setRows(json);
      const cols = json.length ? Object.keys(json[0]) : [];
      setColumns(cols);
      setNameCol((prev) => prev || cols.find((c) => /name/i.test(c)) || cols[0] || '');
    } catch {
      setRows([]);
      setColumns([]);
      setFileName('');
      toast("Couldn't read that file — use an .xlsx, .xls or .csv spreadsheet.");
    }
  };
  reader.onerror = () => toast("Couldn't read that file — try again.");
  reader.readAsArrayBuffer(file);
}
```

- Wrap the body of `handleImport` from `const created = await …` through the `else onClose();` in `try { … } catch (err) { toast(errMessage(err, "Couldn't import that event — try again.")); }`.
- Add the drop handlers and dragging style to the file `<button>`:

```tsx
        <button
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          className={`mt-[18px] flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-[26px] transition-all ${
            fileName || dragging
              ? 'border-brand bg-brand-tint'
              : 'border-line-2 bg-surface hover:border-brand hover:bg-brand-tint'
          }`}
        >
```

(This also replaces the raw `#c8ccc2` border with the `border-line-2` token.)

- Replace the outer backdrop and panel with `<Dialog size="lg" title="Import event spreadsheet" description="Upload a CSV or XLSX of attendees." busy={createEvent.isPending} onClose={onClose} footer={…existing Cancel + Import buttons…}>`, and replace the name/date grid with `<EventDetailsFields … />`. Keep the hidden file input, the drop button, the Name-column select and the row-count hint as children.

- [ ] **Step 8: Name fields no longer snap back.** In `src/pages/SettingsPage.tsx`:
  - `const [name, setName] = useState(user?.displayName ?? '');`. `RequireAuth` guarantees `user` is loaded before this mounts.
  - Delete `const value = name || user.displayName;` and use `name` wherever `value` was used.
  - Change the mutate call to `update.mutate(trimmed, { onSuccess: () => toast('Name updated'), onError: (err) => toast(errMessage(err, "Couldn't save your name — try again.")) });` and import `errMessage`.

  Apply the same change in `src/pages/OnboardingPage.tsx`. Move `const [name, setName] = useState(user?.displayName ?? '');` above the early returns (hooks first), delete the `value` line, use `name`, and add the same `onError` toast (import `toast` and `errMessage`).

- [ ] **Step 9: Shared dates in trash and cards.** In `src/components/EventCard.tsx`, delete the local `fmtDate` and `import { fmtDate } from '../lib/format';`. In `src/pages/TrashPage.tsx`, delete the local `TRASH_RETENTION_DAYS`, `fmtDate` and `daysLeft`, and import `fmtDate`, `daysUntil` and `TRASH_RETENTION_DAYS` from `'../lib/format'`. Change the remaining-days line to `const remaining = event.purgeAt ? daysUntil(event.purgeAt) : 0;`.

- [ ] **Step 10: Verify.** Run `npm run validate && npm run build`. Then `grep -rn "backdrop-blur" src/components` must match only `ui/Dialog.tsx`. Manual check:
  1. Open each dialog (New event → Upload, New event → Link sheet, card menu → Edit, card menu → Move to trash, Trash → Delete forever, Settings → Sign out). Each closes with Escape and with a backdrop click, and neither works while a save is pending.
  2. Drag an `.xlsx` onto the import drop zone: it's read. Drop a `.png`: a readable toast appears. Stop the backend and click Import: a readable toast appears and the dialog stays open.
  3. Settings: select the whole name, delete it and type a new one. It doesn't refill. Save shows "Name updated".
  4. Trash shows "N day(s) left" from the server's `purgeAt`.

- [ ] **Step 11: Commit**

```bash
git add -A src
git commit -m "refactor(ui): shared Dialog/ConfirmDialog, import drag-drop and error handling, name field fixes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task FE-5: Dead files, self-hosted logo, trimmed fonts (D1-files, D2, L1)

**Why:** Unused assets add noise. The sign-in page hotlinks its logo from a third-party WordPress site. The font stylesheet requests weights nothing renders.

**Depends on:** FE-0. **Files:** FE-5 row only.

- [ ] **Step 1: Confirm the files are unused, then delete them.**

```bash
cd /Users/mn.afridi/Desktop/ItComPrint/frontend
grep -rn "icons.svg\|vite.svg\|itcomuz-icon.png" src index.html public || echo "unused"
git rm public/icons.svg src/assets/vite.svg public/brand/itcomuz-icon.png
```

Expected before `git rm`: `unused`. (`itcomuz-icon-white.png` is used by the sidebar, so keep it.) If `src/assets/` is now empty, git drops it automatically.

- [ ] **Step 2: Self-host the logo.**

```bash
curl -fsSL -o public/brand/itcom-logo-horizontal.png \
  https://itcom.uz/wp-content/uploads/2025/11/logo-itCommunity-green-horizontal.png
file public/brand/itcom-logo-horizontal.png   # expect: PNG image data
```

In `src/pages/LandingPage.tsx` (≈ line 227), change the `<img src=…>` to `src="/brand/itcom-logo-horizontal.png"`. Change nothing else in that file.

- [ ] **Step 3: Trim font weights.** The badge-only families (Inter, Raleway, Roboto) are drawn by `renderBadge.ts` only at regular or bold. In `index.html`, replace the Google Fonts `href` with:

```
https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Montserrat:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700&family=Raleway:wght@400;700&family=Roboto:wght@400;700&display=swap
```

(Montserrat and Open Sans keep their UI weights.)

- [ ] **Step 4: Verify.** Run `npm run validate && npm run build`. Manual check: `/login` shows the logo, and DevTools → Network shows no request to `itcom.uz`. In `/app/templates`, a zone set to Raleway bold and one set to Roboto regular still render in those faces in the print simulation.

- [ ] **Step 5: Commit**

```bash
git add -A public src index.html
git commit -m "chore: remove unused assets, self-host landing logo, trim badge font weights

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task OPS-1: Production data cleanup (orchestrator; ASK THE USER FIRST)

**Why:** Mongoose `autoIndex` creates new indexes but never drops removed ones, and it doesn't strip removed fields. The unique default-template index from BE-3 fails to build if duplicate defaults already exist. These steps touch the production Atlas cluster, so **present them to the user and run nothing without explicit approval.** Also offer that the user can run them.

- [ ] **Step 1: Check for duplicate defaults** (read-only):

```js
db.badgetemplates.countDocuments({ isDefault: true }); // must be 1; if 2+, ask the user which one to keep
```

- [ ] **Step 2: After approval, drop the dead index and field:**

```js
db.attendees.dropIndex('eventId_1_searchText_1');
db.attendees.updateMany({ searchText: { $exists: true } }, { $unset: { searchText: '' } });
db.badgetemplates.dropIndex('isDefault_1'); // replaced by the partial unique index; ignore "index not found"
db.users.getIndexes(); // googleId should have one unique index after the next boot
```

Run Step 2 **before** deploying BE-3. The new index gets its own name (`one_default_template`), but dropping the old `isDefault_1` first keeps the index set clean.

- [ ] **Step 3:** After the next backend deploy, check the logs for `[db] connected` and no index build errors.

---

## Task DOC-1: Bring CLAUDE.md in line with the code (D3)

**Depends on:** all tasks merged. **Files:** `frontend/docs/CLAUDE.md` (the root `CLAUDE.md` symlinks to it) and `backend/CLAUDE.md`.

- [ ] **Step 1: `frontend/docs/CLAUDE.md` edits:**
  - Repos table, backend row: replace `(ESM, \`module: NodeNext\`)`with`(CommonJS output — no \`"type": "module"\`; \`module: NodeNext\`)`.
  - Data flow: replace the sentence starting "The backend's `searchText` field…" with: "The roster endpoint takes no query params: search and filtering are client-side only."
  - Data flow, new bullet: "**Printing patches the cache**: `usePrintAttendee` writes the returned attendee into `['attendees', eventId]` instead of refetching. **Sheet-linked kiosks are live**: `useSheetSync` pulls the sheet every 30 s and polls the roster (10 s) and events (30 s), so stations see each other's prints and template switches. Polling pauses in hidden tabs."
  - Badge templates: replace "`listTemplates()` calls `ensureDefaultTemplate()` first" with "`ensureDefaultTemplate()` upserts the default once at boot (`server.ts`); a partial unique index allows only one". Add: "Kiosk and editor previews render through `useBadgeCanvas` (the real print raster). Zone text lives in `printer/zones.ts`."
  - App shell: add "`<Toast />` is mounted once in `App.tsx`. Modals use `components/ui/Dialog.tsx` / `ConfirmDialog.tsx`."
  - Known gaps: replace the batch-print bullet with "Batch print runs sequentially; failures don't stop the run and stay selected for retry."
- [ ] **Step 2: `backend/CLAUDE.md` edits:** In line 7, apply the same ESM → CommonJS correction. In the endpoint table row for `GET /events/:id/attendees`, remove the `?search=` / `?status=` text. In the Attendee model line, remove `searchText`. Delete the "`searchText` is denormalized at write time…" bullet. Add: "Trash: `purgeExpiredTrash()` runs hourly from `server.ts`; `GET /events/trash` hides expired items and returns `purgeAt`." and "`POST /events/:id/sync-sheet` returns `lastSyncedAt`."
- [ ] **Step 3: Commit in each repo** with `docs: sync CLAUDE.md with audit fixes` plus the trailer.

---

## Task INT-1: Integration pass (orchestrator)

- [ ] **Step 1:** In the backend, run `npm run validate && npm run verify && npm run smoke`. All must pass.
- [ ] **Step 2:** In the frontend (after all Wave-B merges), run `npm run validate && npm run build`. Compare chunk sizes with the baseline from Task 0 Step 3: the main chunk must not grow by more than ~2 KB gz.
- [ ] **Step 3: End-to-end walkthrough** (both apps running locally). Import an XLSX event, print one badge, batch print three, edit the event, move it to trash, restore it, then delete it permanently. Link a sheet event and run the two-window check from FE-3. Open the template editor and the kiosk Template tab (unchanged). Every action must give a visible, readable toast.
- [ ] **Step 4:** Use superpowers:finishing-a-development-branch for both repos (the user decides between PR and merge).

---

## Coverage map (audit finding → task)

| Finding           | Task               | Finding          | Task         | Finding          | Task                       |
| ----------------- | ------------------ | ---------------- | ------------ | ---------------- | -------------------------- |
| U1 toasts         | FE-0               | P1 print refetch | FE-1         | B6 rollback      | BE-2                       |
| U2 raw errors     | FE-0               | P2 sync polling  | FE-3 + BE-2  | B7 default seed  | BE-3                       |
| U3 stale draft    | FE-2               | P3 search/rows   | FE-1         | B8 conventions   | BE-2 (author), BE-3        |
| U4 canvas preview | FE-2               | P4 PNG encode    | FE-1         | B9 purge job     | BE-2                       |
| U5 template tab   | **kept (user)**    | B1 scoped counts | BE-2         | B10 limits       | BE-3 + FE-0 (413 copy)     |
| U6 batch print    | FE-1               | B2 payload       | BE-1         | R1 dialogs       | FE-4                       |
| U7 name fields    | FE-4               | B3 search path   | BE-1 + OPS-1 | R2 zone logic    | FE-2 (panel tab untouched) |
| U8 import         | FE-4               | B4 field keys    | BE-3 + FE-2  | R3 template hook | FE-0 + FE-1 + FE-2         |
| U10 live stations | FE-3               | B5 cycle         | BE-1         | R4 event fields  | FE-4                       |
| R5 helpers        | FE-0 + BE-2 + FE-4 | D1 dead code     | FE-0 + FE-5  | D2 logo          | FE-5                       |
| D3 docs           | DOC-1              | L1 fonts         | FE-5         |                  |                            |
