# Bus Route Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-detect bus cities from sheet answers on every sync, let staff regroup/rename them in Edit Event, and filter the kiosk roster by bus with per-bus arrival counts.

**Architecture:** Sync (backend) parses every `extra` value for the three bot phrasings, groups them by a consonant-skeleton key, and appends unseen phrases to `event.busRoutes` — additive only, so human edits stand. The frontend matches attendees to routes by phrase, entirely client-side, next to the existing search filter.

**Tech Stack:** Express 5 + Mongoose 9 + Zod 4 (backend), React 19 + React Query + Tailwind v4 (frontend).

**Spec:** `frontend/docs/superpowers/specs/2026-09-23-bus-route-filter-design.md`

## Global Constraints

- Two separate git repos (`frontend/`, `backend/`), **both on `feat/main-sheet-tab-linking`**. Commit in each repo separately. Never merge to main.
- Backend test harness is `npm run verify` (in `backend/`). **No unit tests, no test framework** — add `check(...)` calls to `backend/scripts/verify.ts`.
- Frontend has **no tests**; its gate is `npm run validate` + `npm run build` (in `frontend/`) and a manual check.
- Backend layering: `routes → controllers → services → models`; pure helpers in `utils/`. Throw `AppError` from services.
- Colors via tokens only (`bg-brand-tint`, `text-ink-3`, `text-danger`, …) — never raw hex.
- Comments: one-liners, only for the non-obvious _why_.
- Route label = **English** city capture (`Bus from Kogan` → `Kogan`); Uzbek stem, then Russian capture, only as fallback.
- Invariants: a phrase belongs to at most one route; labels unique case-insensitively within an event.
- Commit message trailer (every commit):
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WvWcwL9smPahz1m5DyV4tX
  ```

## File Map

| File                                                | Responsibility                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `backend/src/utils/columnLetter.ts` (new)           | 0-based index → A1 column letter                                 |
| `backend/src/utils/busRoutes.ts` (new)              | Parse phrases, skeleton key, label choice, additive merge — pure |
| `backend/src/services/sheetSync.services.ts`        | Blank/missing-header fix; call the merge during sync             |
| `backend/src/models/event.model.ts`                 | `BusRoute` type + `busRoutes` subdocument array                  |
| `backend/src/validators/event.validators.ts`        | `busRoutes` on PATCH with invariant checks                       |
| `backend/src/services/event.services.ts`            | `updateEvent` writes `busRoutes`                                 |
| `backend/src/controllers/event.controllers.ts`      | Log `event.update` for route edits                               |
| `backend/scripts/verify.ts`                         | Pure + HTTP assertions                                           |
| `frontend/src/types.ts`                             | `BusRoute`, `AppEvent.busRoutes`, `UpdateEventPayload`           |
| `frontend/src/lib/api.ts`, `hooks/useEvents.ts`     | PATCH payload accepts `busRoutes`                                |
| `frontend/src/lib/busRoutes.ts` (new)               | Attendee→route lookup, `movePhrase`, validation                  |
| `frontend/src/components/BusRouteFilter.tsx` (new)  | Kiosk chips                                                      |
| `frontend/src/components/AttendeeTable.tsx`         | Route filter state, scoped stats                                 |
| `frontend/src/components/BusRoutesEditor.tsx` (new) | Edit Event route section                                         |
| `frontend/src/components/EditEventDialog.tsx`       | Hosts the editor, saves routes when changed                      |
| `frontend/docs/CLAUDE.md`                           | Document the feature                                             |

---

### Task 1: Stop dropping blank-header columns

**Files:**

- Create: `backend/src/utils/columnLetter.ts`
- Modify: `backend/src/services/sheetSync.services.ts` (`mapSheetRows`, the `extra` loop near line 107)
- Test: `backend/scripts/verify.ts` (after the `'mapSheetRows on an empty tab → no rows, no error'` check, ~line 160)

**Interfaces:**

- Produces: `columnLetter(index: number): string` — `0 → "A"`, `25 → "Z"`, `26 → "AA"`.
- Produces: `mapSheetRows` now keys a missing/blank-header column as its letter, and reads every cell in the row even past the header's length.

- [ ] **Step 1: Write the failing checks** — insert into `verify.ts` right after the empty-tab check:

```ts
const { columnLetter } = await import('../src/utils/columnLetter');
check('columnLetter maps A, Z, AA, AZ', [0, 25, 26, 51].map(columnLetter).join() === 'A,Z,AA,AZ');

// Sheets trims trailing empty header cells; the bot's per-language columns sit past them.
const blankHeaderResult = mapSheetRows([
  ['Reg. Number', 'First Name', '', 'Company'],
  ['R1', 'Ann', 'mid-blank', 'Acme', '', 'Xivadan Avtobusda', 'Telegram kanaldan'],
]);
const blankExtra = blankHeaderResult.mapped[0].extra;
check(
  'mapSheetRows keys a blank mid-row header by column letter',
  blankExtra.C === 'mid-blank' && !('' in blankExtra),
  blankExtra,
);
check(
  'mapSheetRows keeps columns past the last header, keyed by letter',
  blankExtra.F === 'Xivadan Avtobusda' && blankExtra.G === 'Telegram kanaldan',
  blankExtra,
);
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && npm run verify`
Expected: crash on `Cannot find module '../src/utils/columnLetter'`.

- [ ] **Step 3: Create `backend/src/utils/columnLetter.ts`**

```ts
/** 0-based column index → A1 letter: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}
```

- [ ] **Step 4: Run to confirm the letter check passes and the mapping checks fail**

Run: `cd backend && npm run verify`
Expected: `✓ columnLetter maps A, Z, AA, AZ`, `✗` on both `mapSheetRows keys…` / `keeps columns past…`.

- [ ] **Step 5: Fix `mapSheetRows`** — in `sheetSync.services.ts`, add the import and replace the `extra` loop:

```ts
import { columnLetter } from '../utils/columnLetter';
```

Replace:

```ts
const extra: Record<string, string> = {};
header.forEach((col, j) => {
  if (j === regIdx || j === fullNameIdx) return; // First/Last Name stay in extra for templates
  const value = (row[j] ?? '').trim();
  if (value) extra[col] = value;
});
```

with:

```ts
const extra: Record<string, string> = {};
// Walk the row, not the header: Sheets trims trailing blank header cells, and the
// bot's per-language answer columns often sit past them.
row.forEach((raw, j) => {
  if (j === regIdx || j === fullNameIdx) return; // First/Last Name stay in extra for templates
  const value = (raw ?? '').trim();
  if (value) extra[header[j] || columnLetter(j)] = value;
});
```

Also update the doc comment above `mapSheetRows`: change `every other non-empty column lands in \`extra\`.`to`every other non-empty column lands in \`extra\`, keyed by header (or column letter when the header is blank).`

- [ ] **Step 6: Run verify**

Run: `cd backend && npm run verify`
Expected: `ALL PASSED`.

- [ ] **Step 7: Commit**

```bash
cd backend
git add src/utils/columnLetter.ts src/services/sheetSync.services.ts scripts/verify.ts
git commit -m "fix(sync): keep blank-header sheet columns, keyed by column letter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WvWcwL9smPahz1m5DyV4tX"
```

---

### Task 2: Pure bus-route detection helpers

**Files:**

- Modify: `backend/src/models/event.model.ts` (add exported `BusRoute` interface only — schema comes in Task 3)
- Create: `backend/src/utils/busRoutes.ts`
- Test: `backend/scripts/verify.ts` (directly after Task 1's checks)

**Interfaces:**

- Produces (model): `export interface BusRoute { label: string; autoLabel: boolean; phrases: string[]; hidden: boolean }`
- Produces (utils):
  - `parseBusPhrase(value: string): { lang: 'en' | 'uz' | 'ru'; city: string } | null`
  - `citySkeleton(city: string): string`
  - `mergeDetectedRoutes(routes: readonly BusRoute[], values: Iterable<string>): { routes: BusRoute[]; changed: boolean }`

- [ ] **Step 1: Add the type to `event.model.ts`** (above `EventDoc`):

```ts
/** A bus city: its chip label plus every bot answer (in any language) that means it. */
export interface BusRoute {
  label: string;
  autoLabel: boolean; // true until a human renames it; sync may improve it
  phrases: string[];
  hidden: boolean;
}
```

- [ ] **Step 2: Write the failing checks** in `verify.ts`:

```ts
const { parseBusPhrase, citySkeleton, mergeDetectedRoutes } =
  await import('../src/utils/busRoutes');
check(
  'parseBusPhrase reads all three bot languages',
  JSON.stringify(
    ['Bus from Kogan', 'Kogondan Avtobusda', 'Автобус из Кагана'].map(parseBusPhrase),
  ) ===
    JSON.stringify([
      { lang: 'en', city: 'Kogan' },
      { lang: 'uz', city: 'Kogon' },
      { lang: 'ru', city: 'Кагана' },
    ]),
);
check(
  'parseBusPhrase ignores no-bus answers',
  ["O'zim kelaman", 'Я приду сам', 'I will come on my own', 'Telegram'].every(
    (v) => parseBusPhrase(v) === null,
  ),
);
const skeletons = (names: string[]) => new Set(names.map(citySkeleton)).size === 1;
check(
  'citySkeleton links spellings of one city across languages',
  skeletons(['Kogon', 'Кагана', 'Kogan']) &&
    skeletons(['Xiva', 'Хивы', 'Khiva']) &&
    skeletons(['Buxoro', 'Бухары', 'Bukhara']) &&
    skeletons(['Samarqand', 'Самарканда', 'Samarkand']) &&
    skeletons(['Toshkent', 'Ташкента', 'Tashkent']),
);
check('citySkeleton keeps different cities apart', citySkeleton('Kogan') !== citySkeleton('Khiva'));

const detected = mergeDetectedRoutes(
  [],
  ['Kogondan Avtobusda', "O'zim kelaman", 'Автобус из Кагана', 'Bus from Kogan', 'Автобус из Хивы'],
);
check(
  'mergeDetectedRoutes groups one city into one English-labeled route',
  detected.changed &&
    detected.routes.length === 2 &&
    detected.routes[0].label === 'Kogan' &&
    detected.routes[0].phrases.length === 3 &&
    detected.routes[1].label === 'Хивы',
  detected.routes,
);
const humanRoutes = [
  { label: 'Kogon bus', autoLabel: false, phrases: ['Kogondan Avtobusda'], hidden: false },
  { label: 'Кагана', autoLabel: true, phrases: ['Автобус из Кагана'], hidden: true },
];
const rerun = mergeDetectedRoutes(humanRoutes, [
  'Kogondan Avtobusda',
  'Автобус из Кагана',
  'Bus from Kogan',
]);
check(
  'mergeDetectedRoutes never moves a placed phrase or renames a human label',
  rerun.routes[0].label === 'Kogon bus' &&
    rerun.routes[0].phrases.join() === 'Kogondan Avtobusda,Bus from Kogan' &&
    rerun.routes[1].phrases.join() === 'Автобус из Кагана' &&
    rerun.routes[1].hidden === true,
  rerun.routes,
);
check(
  'mergeDetectedRoutes reports no change when nothing is new',
  !mergeDetectedRoutes(rerun.routes, ['Bus from Kogan', 'Telegram']).changed,
);
```

Note on the rerun expectation: `Bus from Kogan` joins the **first** route with a matching skeleton (`Kogon bus`); the human-labeled route keeps its label; the second route is `autoLabel: true` but its only phrase is Russian, so its label stays `Кагана`.

- [ ] **Step 3: Run to confirm failure**

Run: `cd backend && npm run verify`
Expected: crash on `Cannot find module '../src/utils/busRoutes'`.

- [ ] **Step 4: Create `backend/src/utils/busRoutes.ts`**

```ts
import type { BusRoute } from '../models/event.model';

type Lang = 'en' | 'uz' | 'ru';

// The registration bot's fixed "coming by bus" wording, one per language.
const PATTERNS: [Lang, RegExp][] = [
  ['en', /^bus\s+from\s+(.+)$/i],
  ['uz', /^(.+?)dan\s+avtobusda$/i],
  ['ru', /^автобус\s+из\s+(.+)$/i],
];

// English first: that's the spelling shown on the chip.
const LABEL_PREFERENCE: Lang[] = ['en', 'uz', 'ru'];

const CYRILLIC: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'x',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sh',
  ъ: '',
  ы: 'i',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  қ: 'k',
  ғ: 'g',
  ҳ: 'h',
  ў: 'o',
};

export function parseBusPhrase(value: string): { lang: Lang; city: string } | null {
  const text = value.trim();
  for (const [lang, pattern] of PATTERNS) {
    const match = pattern.exec(text);
    if (match) return { lang, city: match[1].trim() };
  }
  return null;
}

/**
 * Language-neutral key for a city name: transliterate, unify kh/q/dj, drop vowels.
 * Dropping vowels also strips Russian case endings (Кагана → kgn = Kogan).
 */
export function citySkeleton(city: string): string {
  const latin = [...city.toLowerCase().replace(/['ʻʼ’‘`]/g, '')]
    .map((ch) => CYRILLIC[ch] ?? ch)
    .join('');
  return latin
    .replace(/kh/g, 'x')
    .replace(/q/g, 'k')
    .replace(/dzh|dj/g, 'j')
    .replace(/[^a-z]/g, '')
    .replace(/[aeiouy]/g, '')
    .replace(/(.)\1+/g, '$1');
}

const skeletonOf = (phrase: string) => {
  const parsed = parseBusPhrase(phrase);
  return parsed && citySkeleton(parsed.city);
};

function labelFor(phrases: string[]): string {
  const parsed = phrases.map(parseBusPhrase);
  for (const lang of LABEL_PREFERENCE) {
    const hit = parsed.find((p) => p?.lang === lang);
    if (hit) return hit.city;
  }
  return phrases[0];
}

/**
 * Places bus phrases no route holds yet: into a route with the same city skeleton,
 * else a new route. Additive only — never moves a placed phrase, renames a
 * human-set label, or removes anything, so edits made in the app survive every sync.
 */
export function mergeDetectedRoutes(
  routes: readonly BusRoute[],
  values: Iterable<string>,
): { routes: BusRoute[]; changed: boolean } {
  // Explicit fields: callers may pass Mongoose subdocuments, whose spread carries internals.
  const next = routes.map(({ label, autoLabel, phrases, hidden }) => ({
    label,
    autoLabel,
    phrases: [...phrases],
    hidden,
  }));
  const placed = new Set(next.flatMap((r) => r.phrases));
  let changed = false;

  for (const value of new Set(values)) {
    if (placed.has(value)) continue;
    const key = skeletonOf(value);
    if (!key) continue;
    const route = next.find((r) => r.phrases.some((p) => skeletonOf(p) === key));
    if (route) route.phrases.push(value);
    else next.push({ label: '', autoLabel: true, phrases: [value], hidden: false });
    placed.add(value);
    changed = true;
  }

  for (const route of next) {
    if (!route.autoLabel) continue;
    const label = labelFor(route.phrases);
    if (label !== route.label) {
      route.label = label;
      changed = true;
    }
  }
  return { routes: next, changed };
}
```

Note the order in `citySkeleton`: non-letters are stripped **before** vowels so the `[aeiouy]` pass only ever sees `a–z`.

- [ ] **Step 5: Run verify**

Run: `cd backend && npm run verify`
Expected: `ALL PASSED`. If `citySkeleton links spellings…` fails, print `['Kogon','Кагана','Kogan'].map(citySkeleton)` etc. in a scratch `tsx -e` to see which pair diverges before changing the rules.

- [ ] **Step 6: Typecheck + commit**

```bash
cd backend
npm run typecheck
git add src/utils/busRoutes.ts src/models/event.model.ts scripts/verify.ts
git commit -m "feat(bus-routes): detect and group bus phrases across languages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WvWcwL9smPahz1m5DyV4tX"
```

---

### Task 3: Persist routes on sync and accept edits over PATCH

**Files:**

- Modify: `backend/src/models/event.model.ts` (schema)
- Modify: `backend/src/services/sheetSync.services.ts` (`syncEventAttendees`)
- Modify: `backend/src/validators/event.validators.ts` (`updateEventSchema`)
- Modify: `backend/src/services/event.services.ts` (`updateEvent`)
- Modify: `backend/src/controllers/event.controllers.ts` (`update`)
- Test: `backend/scripts/verify.ts` (new section right before `// --- LOGOUT ---`)

**Interfaces:**

- Consumes: `BusRoute`, `mergeDetectedRoutes` from Task 2.
- Produces: `GET /events` and `GET /events/:id` include `busRoutes: BusRoute[]` (absent on lean docs for events never synced since this shipped — clients treat missing as `[]`).
- Produces: `PATCH /events/:id` accepts `{ busRoutes: BusRoute[] }`; 400 on empty label, empty phrases, duplicate phrase, or duplicate label (case-insensitive).

- [ ] **Step 1: Write the failing HTTP checks** — insert immediately before `    // --- LOGOUT ---`:

```ts
// --- BUS ROUTES: detected on sync, edited over PATCH, edits survive resync ---
__setTestSheetTabs(testEnv.MAIN_SHEET_ID, [{ gid: 777, title: 'Bukhara Roadshow' }]);
const busHeader = ['Reg. Number', 'First Name', 'Last Name', 'Kogondan keladigan mehmonlar'];
__setTestTabValues(testEnv.MAIN_SHEET_ID, 'Bukhara Roadshow', [
  busHeader,
  ['B1', 'Ali', 'V', 'Kogondan Avtobusda'],
  ['B2', 'Olga', 'P', '', '', 'Автобус из Кагана'], // past the header → column F
  ['B3', 'Sam', 'K', '', '', '', 'Bus from Kogan'],
  ['B4', 'Iva', 'N', "O'zim kelaman"],
]);
const busEvent = await afetch('/events/sheet', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Bukhara Roadshow', date: '2026-10-05', tabGid: 777 }),
}).then((r) => r.json());
const getBusRoutes = async () =>
  (await afetch(`/events/${busEvent._id}`).then((r) => r.json())).busRoutes;
const firstRoutes = await getBusRoutes();
check(
  'sync on link → one Kogan route holding all three languages',
  firstRoutes?.length === 1 &&
    firstRoutes[0].label === 'Kogan' &&
    firstRoutes[0].autoLabel === true &&
    firstRoutes[0].phrases.length === 3,
  firstRoutes,
);

const patchRoutes = (busRoutes: unknown) =>
  afetch(`/events/${busEvent._id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ busRoutes }),
  });
// Human splits the Russian phrase into its own route and renames the first.
const editRes = await patchRoutes([
  {
    label: 'Kogon bus',
    autoLabel: false,
    phrases: ['Kogondan Avtobusda', 'Bus from Kogan'],
    hidden: false,
  },
  { label: 'Kagan (ru)', autoLabel: false, phrases: ['Автобус из Кагана'], hidden: true },
]);
check('PATCH busRoutes → 200', editRes.status === 200, editRes.status);

__setTestTabValues(testEnv.MAIN_SHEET_ID, 'Bukhara Roadshow', [
  busHeader,
  ['B1', 'Ali', 'V', 'Kogondan Avtobusda'],
  ['B2', 'Olga', 'P', '', '', 'Автобус из Кагана'],
  ['B3', 'Sam', 'K', '', '', '', 'Bus from Kogan'],
  ['B5', 'Zara', 'M', '', '', '', 'Bus from Khiva'], // a new city registers later
]);
await afetch(`/events/${busEvent._id}/sync-sheet`, { method: 'POST' });
const resynced = await getBusRoutes();
check(
  'resync keeps human labels, the split, and hidden; adds the new city',
  resynced.length === 3 &&
    resynced[0].label === 'Kogon bus' &&
    resynced[1].label === 'Kagan (ru)' &&
    resynced[1].hidden === true &&
    resynced[1].phrases.join() === 'Автобус из Кагана' &&
    resynced[2].label === 'Khiva',
  resynced,
);

const dupPhraseRes = await patchRoutes([
  { label: 'A', autoLabel: false, phrases: ['Bus from Kogan'], hidden: false },
  { label: 'B', autoLabel: false, phrases: ['Bus from Kogan'], hidden: false },
]);
check('PATCH busRoutes with a phrase in two routes → 400', dupPhraseRes.status === 400);
const dupLabelRes = await patchRoutes([
  { label: 'Kogan', autoLabel: false, phrases: ['Bus from Kogan'], hidden: false },
  { label: 'kogan', autoLabel: false, phrases: ['Bus from Khiva'], hidden: false },
]);
check('PATCH busRoutes with duplicate labels → 400', dupLabelRes.status === 400);
const emptyLabelRes = await patchRoutes([
  { label: '  ', autoLabel: false, phrases: ['Bus from Kogan'], hidden: false },
]);
check('PATCH busRoutes with an empty label → 400', emptyLabelRes.status === 400);
const emptyRouteRes = await patchRoutes([
  { label: 'Ghost', autoLabel: false, phrases: [], hidden: false },
]);
check('PATCH busRoutes with a phrase-less route → 400', emptyRouteRes.status === 400);
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && npm run verify`
Expected: `✗ sync on link → one Kogan route…` (busRoutes undefined) and `✗ PATCH busRoutes → 200` (400, "No fields to update" or unknown key stripped).

- [ ] **Step 3: Schema** — in `event.model.ts`, add to `EventDoc`:

```ts
  busRoutes: BusRoute[];
```

Above `eventSchema`:

```ts
const busRouteSchema = new Schema<BusRoute>(
  {
    label: { type: String, required: true, trim: true },
    autoLabel: { type: Boolean, default: true },
    phrases: { type: [String], default: [] },
    hidden: { type: Boolean, default: false },
  },
  { _id: false }, // the label is the key; routes are always replaced wholesale
);
```

Inside `eventSchema`, after `lastSyncedAt`:

```ts
  // Bus cities detected from sheet answers on sync; staff can rename/regroup/hide them.
  busRoutes: { type: [busRouteSchema], default: [] },
```

- [ ] **Step 4: Sync** — in `sheetSync.services.ts`, import and call the merge. Add:

```ts
import { mergeDetectedRoutes } from '../utils/busRoutes';
```

In `syncEventAttendees`, replace:

```ts
event.lastSyncedAt = new Date();
await event.save();
```

with:

```ts
const detected = mergeDetectedRoutes(
  event.busRoutes,
  mapped.flatMap((r) => Object.values(r.extra)),
);
if (detected.changed) event.busRoutes = detected.routes;
event.lastSyncedAt = new Date();
await event.save();
```

- [ ] **Step 5: Validator** — in `event.validators.ts`, add above `updateEventSchema`:

```ts
const busRouteSchema = z.object({
  label: z.string().trim().min(1, 'Every bus needs a name').max(100),
  autoLabel: z.boolean(),
  phrases: z.array(z.string().trim().min(1).max(300)).min(1).max(50),
  hidden: z.boolean(),
});

const busRoutesSchema = z
  .array(busRouteSchema)
  .max(50)
  .refine((routes) => {
    const phrases = routes.flatMap((r) => r.phrases);
    return new Set(phrases).size === phrases.length;
  }, 'A phrase can belong to only one bus')
  .refine((routes) => {
    const labels = routes.map((r) => r.label.toLowerCase());
    return new Set(labels).size === labels.length;
  }, 'Two buses have the same name');
```

and add `busRoutes: busRoutesSchema,` to the `updateEventSchema` object (next to `templateId`).

- [ ] **Step 6: Service** — in `updateEvent` (`event.services.ts`), after the `templateId` line:

```ts
if (input.busRoutes !== undefined) update.busRoutes = input.busRoutes;
```

- [ ] **Step 7: Controller** — in `update` (`event.controllers.ts`), change the log condition to:

```ts
if (input.name !== undefined || input.date !== undefined || input.busRoutes !== undefined) {
  await logEvent(req, 'event.update', event);
}
```

- [ ] **Step 8: Run verify + typecheck**

Run: `cd backend && npm run verify && npm run typecheck`
Expected: `ALL PASSED`, no type errors. If `event.busRoutes` types as a Mongoose `DocumentArray` and `mergeDetectedRoutes` rejects it, keep the model interface as `BusRoute[]` (as above) — Mongoose infers hydrated arrays from it without complaint.

- [ ] **Step 9: Smoke + commit**

```bash
cd backend
npm run smoke
git add src/models/event.model.ts src/services/sheetSync.services.ts src/validators/event.validators.ts src/services/event.services.ts src/controllers/event.controllers.ts scripts/verify.ts
git commit -m "feat(bus-routes): store detected routes on events, editable via PATCH

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WvWcwL9smPahz1m5DyV4tX"
```

---

### Task 4: Kiosk bus filter

**Files:**

- Modify: `frontend/src/types.ts`
- Create: `frontend/src/lib/busRoutes.ts`
- Create: `frontend/src/components/BusRouteFilter.tsx`
- Modify: `frontend/src/components/AttendeeTable.tsx`

**Interfaces:**

- Consumes: `AppEvent.busRoutes` from `GET /events` (Task 3).
- Produces (types): `BusRoute`, `AppEvent.busRoutes?: BusRoute[]`, `UpdateEventPayload`.
- Produces (lib): `routeByAttendee(attendees: Attendee[], routes: BusRoute[]): Map<string, string>` (attendee `_id` → route label); `movePhrase(routes: BusRoute[], phrase: string, target: number | 'new'): BusRoute[]`; `busRoutesError(routes: BusRoute[]): string | null`.
- Produces (component): `BusRouteFilter({ counts: RouteCount[]; active: string | null; onChange: (label: string | null) => void })`, `RouteCount = { label: string; total: number; came: number }`.

- [ ] **Step 1: Types** — in `types.ts`, add above `AppEvent`:

```ts
export interface BusRoute {
  label: string;
  autoLabel: boolean;
  phrases: string[];
  hidden: boolean;
}

export interface UpdateEventPayload {
  name?: string;
  date?: string;
  busRoutes?: BusRoute[];
}
```

and inside `AppEvent`, after `lastSyncedAt`:

```ts
  busRoutes?: BusRoute[]; // absent until the event's first sync after bus routes shipped
```

- [ ] **Step 2: Create `frontend/src/lib/busRoutes.ts`**

```ts
import type { Attendee, BusRoute } from '../types';

/** Attendee id → label of the bus route one of their sheet answers belongs to. */
export function routeByAttendee(attendees: Attendee[], routes: BusRoute[]): Map<string, string> {
  const labelOf = new Map(routes.flatMap((r) => r.phrases.map((p) => [p, r.label] as const)));
  const out = new Map<string, string>();
  if (labelOf.size === 0) return out;
  for (const a of attendees) {
    const hit = Object.values(a.extra).find((v) => labelOf.has(v));
    if (hit) out.set(a._id, labelOf.get(hit)!);
  }
  return out;
}

/**
 * Moves a phrase to another route (index into `routes`) or a new one; emptied routes drop.
 * Moving — not removing — pins it: a removed phrase would be re-merged by the next sync.
 */
export function movePhrase(routes: BusRoute[], phrase: string, target: number | 'new'): BusRoute[] {
  const next = routes.map((r) => ({ ...r, phrases: r.phrases.filter((p) => p !== phrase) }));
  // autoLabel: the next sync swaps the raw phrase for the English city name.
  if (target === 'new')
    next.push({ label: phrase, autoLabel: true, phrases: [phrase], hidden: false });
  else next[target].phrases.push(phrase);
  return next.filter((r) => r.phrases.length > 0);
}

/** Why these routes can't be saved, or null. Mirrors the backend's Zod rules. */
export function busRoutesError(routes: BusRoute[]): string | null {
  const labels = routes.map((r) => r.label.trim().toLowerCase());
  if (labels.some((l) => !l)) return 'Every bus needs a name.';
  if (new Set(labels).size !== labels.length) return 'Two buses have the same name.';
  return null;
}
```

- [ ] **Step 3: Create `frontend/src/components/BusRouteFilter.tsx`**

```tsx
import { cn } from '../lib/cn';

export interface RouteCount {
  label: string;
  total: number;
  came: number;
}

/** Bus chips beside search: one click narrows the roster (and stats) to that bus. */
export function BusRouteFilter({
  counts,
  active,
  onChange,
}: {
  counts: RouteCount[];
  active: string | null;
  onChange: (label: string | null) => void;
}) {
  if (counts.length === 0) return null;
  return (
    <div role="group" aria-label="Filter by bus" className="flex shrink-0 flex-wrap gap-2">
      {counts.map((c) => {
        const on = c.label === active;
        return (
          <button
            key={c.label}
            onClick={() => onChange(on ? null : c.label)}
            aria-pressed={on}
            className={cn(
              'flex h-10.5 items-center gap-2 rounded-[10px] border px-3 font-display text-sm font-semibold transition-colors',
              on
                ? 'border-brand bg-brand-tint text-brand-deep'
                : 'border-line-2 bg-surface text-ink hover:border-brand/40',
            )}
          >
            <span aria-hidden>🚌</span>
            {c.label}
            <span className="text-[12px] tabular-nums text-faint">
              {c.came}/{c.total}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Wire into `AttendeeTable.tsx`**

Imports:

```ts
import { BusRouteFilter } from './BusRouteFilter';
import { routeByAttendee } from '../lib/busRoutes';
```

After `const [confirmUnprint, setConfirmUnprint] = useState(false);` add:

```ts
const routes = useMemo(() => (event.busRoutes ?? []).filter((r) => !r.hidden), [event.busRoutes]);
const routeOf = useMemo(() => routeByAttendee(attendees, routes), [attendees, routes]);
const [routeFilter, setRouteFilter] = useState<string | null>(null);
// A route renamed or hidden from another station just falls back to "all".
const activeRoute = routes.some((r) => r.label === routeFilter) ? routeFilter : null;
```

After the existing `printedCount` memo add:

```ts
const routeCounts = useMemo(
  () =>
    routes.map((r) => {
      const riders = attendees.filter((a) => routeOf.get(a._id) === r.label);
      return { label: r.label, total: riders.length, came: riders.filter(isPrinted).length };
    }),
  [routes, attendees, routeOf],
);
const stats = routeCounts.find((c) => c.label === activeRoute) ?? {
  total: attendees.length,
  came: printedCount,
};
```

Change `matchAll` to:

```ts
const matchAll = useCallback(
  (query: string) => {
    const q = query.trim().toLowerCase();
    return attendees.filter((a) => {
      if (activeRoute && routeOf.get(a._id) !== activeRoute) return false;
      if (q && !haystacks.get(a._id)!.includes(q)) return false;
      return true;
    });
  },
  [attendees, haystacks, activeRoute, routeOf],
);
```

In the toolbar JSX, directly after the search `</div>` (the one closing the `relative flex basis-full …` wrapper) add:

```tsx
<BusRouteFilter counts={routeCounts} active={activeRoute} onChange={setRouteFilter} />
```

Replace the `<AttendeeStats … />` props:

```tsx
<AttendeeStats total={stats.total} came={stats.came} className="w-full lg:w-auto" />
```

In the `EmptyState` subtitle, replace `'No attendees match your search.'` with:

```tsx
                : activeRoute && !search.trim()
                  ? `Nobody is registered on the ${activeRoute} bus.`
                  : 'No attendees match your search.'
```

- [ ] **Step 5: Validate + build**

Run: `cd frontend && npm run validate && npm run build`
Expected: clean.

- [ ] **Step 6: Manual check** — `cd backend && npm run dev` and `cd frontend && npm run dev`; open a kiosk for an event linked to a tab with bus answers (e.g. the Kogan tab), hit **Sync**. Expect a `🚌 Kogan n/m` chip; its `m` equals the row count of the old `FILTER(...)` formula for that tab; clicking narrows the list and the Total stat; printing one attendee bumps the chip's `n`; clicking again restores everything. An event with no bus answers shows no chip.

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/types.ts src/lib/busRoutes.ts src/components/BusRouteFilter.tsx src/components/AttendeeTable.tsx
git commit -m "feat(kiosk): filter the roster by bus route with per-bus arrival counts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WvWcwL9smPahz1m5DyV4tX"
```

---

### Task 5: Edit bus routes in the Edit Event dialog

**Files:**

- Modify: `frontend/src/lib/api.ts` (`updateEvent` payload type)
- Modify: `frontend/src/hooks/useEvents.ts` (`useUpdateEvent` variables type)
- Create: `frontend/src/components/BusRoutesEditor.tsx`
- Modify: `frontend/src/components/EditEventDialog.tsx`

**Interfaces:**

- Consumes: `BusRoute`, `UpdateEventPayload` (types, Task 4); `movePhrase`, `busRoutesError` (lib, Task 4); `PATCH /events/:id { busRoutes }` (Task 3).
- Produces: `BusRoutesEditor({ routes: BusRoute[]; onChange: (routes: BusRoute[]) => void })`.

- [ ] **Step 1: API + hook types**

`lib/api.ts` — change the `updateEvent` line to:

```ts
  updateEvent: (eventId: string, payload: UpdateEventPayload) =>
    request<AppEvent>(`/events/${eventId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
```

and add `UpdateEventPayload` to the existing `import type { … } from '../types'` in that file.

`hooks/useEvents.ts` — change `useUpdateEvent`'s `mutationFn` signature to:

```ts
    mutationFn: ({ eventId, ...payload }: { eventId: string } & UpdateEventPayload) =>
      api.updateEvent(eventId, payload),
```

and extend the import: `import type { AppEvent, UpdateEventPayload } from '../types';`

- [ ] **Step 2: Create `frontend/src/components/BusRoutesEditor.tsx`**

```tsx
import { Checkbox } from './ui/Checkbox';
import { Input } from './ui/Input';
import { movePhrase } from '../lib/busRoutes';
import type { BusRoute } from '../types';

/** Rename, regroup and hide the bus routes sync detected for this event. */
export function BusRoutesEditor({
  routes,
  onChange,
}: {
  routes: BusRoute[];
  onChange: (routes: BusRoute[]) => void;
}) {
  const update = (i: number, patch: Partial<BusRoute>) =>
    onChange(routes.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section className="mt-6">
      <h3 className="font-display text-xs font-semibold text-ink-3">Bus routes</h3>
      <p className="mt-1 text-xs text-faint">
        Found in the sheet's answers. Move a phrase to fix how they're grouped.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {routes.map((route, i) => (
          // Index key: the label is being edited, so keying by it would steal focus per keystroke.
          <div key={i} className="rounded-[10px] border border-line-2 p-3">
            <div className="flex items-center gap-3">
              <span aria-hidden>🚌</span>
              <Input
                value={route.label}
                onChange={(e) => update(i, { label: e.target.value, autoLabel: false })}
                aria-label="Bus name"
                className="min-w-0 flex-1"
              />
              <label className="flex shrink-0 items-center gap-2 text-xs text-ink-3">
                <Checkbox
                  checked={route.hidden}
                  onClick={() => update(i, { hidden: !route.hidden })}
                  label="Hide on kiosk"
                />
                Hide
              </label>
            </div>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {route.phrases.map((phrase) => (
                <li key={phrase} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink-2">{phrase}</span>
                  {(routes.length > 1 || route.phrases.length > 1) && (
                    <select
                      value=""
                      onChange={(e) =>
                        onChange(
                          movePhrase(
                            routes,
                            phrase,
                            e.target.value === 'new' ? 'new' : Number(e.target.value),
                          ),
                        )
                      }
                      aria-label={`Move "${phrase}"`}
                      className="h-8 rounded-lg border border-line-2 bg-surface px-2 text-xs text-ink-3"
                    >
                      <option value="" disabled>
                        Move to…
                      </option>
                      {routes.map(
                        (r, j) =>
                          j !== i && (
                            <option key={j} value={j}>
                              {r.label || 'Untitled bus'}
                            </option>
                          ),
                      )}
                      {route.phrases.length > 1 && <option value="new">New bus</option>}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Host it in `EditEventDialog.tsx`** — full replacement of the component body's state/save/JSX:

```tsx
import { useState } from 'react';
import { useUpdateEvent } from '../hooks/useEvents';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { busRoutesError } from '../lib/busRoutes';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { EventDetailsFields } from './EventDetailsFields';
import { BusRoutesEditor } from './BusRoutesEditor';
import type { AppEvent } from '../types';

export function EditEventDialog({ event, onClose }: { event: AppEvent; onClose: () => void }) {
  const [name, setName] = useState(event.name);
  const [date, setDate] = useState(event.date.slice(0, 10));
  const [initialRoutes] = useState(() => event.busRoutes ?? []);
  const [routes, setRoutes] = useState(initialRoutes);
  const updateEvent = useUpdateEvent();

  const routesError = busRoutesError(routes);
  // Only send routes when edited, so an untouched dialog can't drop a phrase sync just added.
  const routesChanged = JSON.stringify(routes) !== JSON.stringify(initialRoutes);
  const canSave = !!name.trim() && !!date && !routesError;

  async function handleSave() {
    try {
      await updateEvent.mutateAsync({
        eventId: event._id,
        name: name.trim(),
        date,
        ...(routesChanged && {
          busRoutes: routes.map((r) => ({ ...r, label: r.label.trim() })),
        }),
      });
      toast('Event updated');
      onClose();
    } catch (err) {
      toast(errMessage(err, "Couldn't update that event — try again."));
    }
  }

  return (
    <Dialog
      title="Edit event"
      size={initialRoutes.length > 0 ? 'lg' : 'md'}
      busy={updateEvent.isPending}
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
            onClick={handleSave}
            disabled={!canSave || updateEvent.isPending}
            className="h-11 rounded-[10px] px-6 text-sm"
          >
            {updateEvent.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <EventDetailsFields name={name} date={date} onNameChange={setName} onDateChange={setDate} />
      {initialRoutes.length > 0 && <BusRoutesEditor routes={routes} onChange={setRoutes} />}
      {routesError && <p className="mt-2 text-xs text-danger">{routesError}</p>}
    </Dialog>
  );
}
```

- [ ] **Step 4: Validate + build**

Run: `cd frontend && npm run validate && npm run build`
Expected: clean.

- [ ] **Step 5: Manual check** — open Edit Event on a bus event:
  - Rename "Kogan" → "Kogan bus", save → kiosk chip reads `🚌 Kogan bus`; after the next 30 s sync it **stays** renamed.
  - Move `Автобус из Кагана` → "New bus", save → two chips; after a sync the new chip is **still separate** (label may switch to the English name only if an English phrase is in it — here it stays `Кагана`).
  - Move it back into the first route → the emptied route disappears.
  - Tick Hide → chip gone from the kiosk.
  - Blank a name → Save disabled with "Every bus needs a name."
  - An event with no bus answers → dialog looks exactly as before (no section, `md` width).

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/lib/api.ts src/hooks/useEvents.ts src/components/BusRoutesEditor.tsx src/components/EditEventDialog.tsx
git commit -m "feat(events): rename, regroup and hide bus routes in Edit Event

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WvWcwL9smPahz1m5DyV4tX"
```

---

### Task 6: Document it

**Files:**

- Modify: `frontend/docs/CLAUDE.md` (Data flow section)
- Modify: `backend/CLAUDE.md` (sync section — read it first and add in its style)

- [ ] **Step 1: Add to the Data flow bullets in `frontend/docs/CLAUDE.md`**, after the "Sheet-linked kiosks are live" bullet:

```markdown
- **Bus routes**: every sync scans attendee `extra` values for the bot's bus answers (`Bus from X` / `Xdan Avtobusda` / `Автобус из X`), groups the three languages by a consonant-skeleton key (`utils/busRoutes.ts`), and **appends** unseen phrases to `event.busRoutes` — it never renames a human-set label, moves a placed phrase, or deletes, so Edit Event corrections survive. Chips beside kiosk search filter the roster by phrase match, client-side. Blank or missing sheet headers are keyed by column letter (`L`, `N`), because the bot's per-language answer columns sit past the last filled header.
```

- [ ] **Step 2: Mirror the essentials in `backend/CLAUDE.md`** near its sheet-sync notes (two or three lines: additive merge, blank header → column letter, verify covers both).

- [ ] **Step 3: Commit both repos**

```bash
cd frontend && git add docs/CLAUDE.md && git commit -m "docs: note bus route filter in CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WvWcwL9smPahz1m5DyV4tX"
cd ../backend && git add CLAUDE.md && git commit -m "docs: note bus route detection in sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WvWcwL9smPahz1m5DyV4tX"
```
