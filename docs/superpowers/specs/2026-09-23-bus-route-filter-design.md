# Bus route filter on the kiosk — Design

**Date:** 2026-09-23
**Status:** Approved in chat, pending spec review

## Problem

Roadshows bring attendees in by bus from one or two cities other than the host
city. Staff need to see those people as a group — who is on the Kogan bus, and
how many of them have arrived — without leaving the kiosk. Today they do this
outside the app with a sheet formula:

```
=FILTER({...}, REGEXMATCH(J&"|"&L&"|"&N, "Bus from Kogan|Kogondan Avtobusda|Автобус из Кагана"))
```

### What the data looks like

The registration bot asks "how will you get here?" in the attendee's language,
so a tab has **three question/answer column pairs** (e.g. J/K, L/M, N/O) and
each row fills only one of them. Observed facts, from the Kogan and Khiva tabs:

- Answers are **fixed bot options**, one wording per language:
  - Bus: `Kogondan Avtobusda` / `Автобус из Кагана` / `Bus from Kogan`
  - No bus: `O'zim kelaman` / `Я приду сам` / `I will come on my own`
  - Empty: the person never answered.
- **The language → column order differs between tabs** (Kogan: Uzbek in J;
  Khiva: English in J, Uzbek in L, Russian in N). Column letters can't be
  hard-coded.
- The city name is inflected differently per language (`Kogon`-dan, `Кагана`,
  `Kogan`), so the three wordings can't be linked by string equality.

### Blocking bug: blank-header columns are lost

Columns L–O have **empty header cells**. The Sheets API trims trailing empty
cells, so the header row comes back only as long as its last filled cell (K),
and `mapSheetRows` iterates the _header_ — every column past it is silently
dropped. A blank header in the middle of the row would instead write to
`extra[""]`, where the rightmost such column wins. Either way a row with
`L = "Xivadan Avtobusda"` never gets its bus answer to the kiosk. This must be
fixed regardless of the feature.

## Goals

- Linking a tab automatically discovers its bus cities; no setup step.
- The three language wordings of one city appear as **one** filter chip.
- Late registrants (arriving on later syncs) are picked up automatically.
- Staff can correct a wrong grouping or label in-app, and **sync never undoes
  a human correction**.
- On the kiosk, a chip filters the roster to that bus and scopes the arrival
  stats and batch print to it.

## Non-goals

- A global city dictionary. Routes are per event.
- Deleting routes. A deleted route would be recreated by the next sync;
  `hidden` covers "I don't want to see this chip".
- Fixing duplicate **non-blank** headers (a separate, pre-existing issue).
- Any bus info on the dashboard/event cards (possible later; not needed now).

## Design

### 1. Blank-header fix (`sheetSync.services.ts`)

In `mapSheetRows`, `extra` is built by iterating each **row** to its full length
(not the header), and a column whose header is missing or blank is keyed by its
**column letter** (`L`, `N`, `AA`). A small `columnLetter(index)` helper goes in
`utils/`. Existing attendees get their corrected `extra` on the next sync, since
sync already overwrites `extra` wholesale.

### 2. Data model (`event.model.ts`)

```ts
interface BusRoute {
  label: string; // chip text, e.g. "Kogan"
  autoLabel: boolean; // true until a human renames it; sync may improve it
  phrases: string[]; // exact bot answers, e.g. ["Kogondan Avtobusda", "Автобус из Кагана", "Bus from Kogan"]
  hidden: boolean; // hide the chip on the kiosk
}
// EventDoc gains: busRoutes: BusRoute[]  (default [])
```

Invariants: **a phrase belongs to at most one route**, and **labels are unique**
(case-insensitive) within an event. The label doubles as the route's key on the
kiosk, so routes need no ids.

Why phrases live on the event rather than a `busRoute` field on each attendee:
a rename or regroup in the edit dialog takes effect on the kiosk immediately,
with no attendee rewrite and no wait for the next sync.

### 3. Detection (`utils/busRoutes.ts`, pure functions)

**Parse.** Match each `extra` value (trimmed, case-insensitive) against:

| Lang | Pattern                  | City capture |
| ---- | ------------------------ | ------------ |
| en   | `^bus\s+from\s+(.+)$`    | `Kogan`      |
| uz   | `^(.+?)dan\s+avtobusda$` | `Kogon`      |
| ru   | `^автобус\s+из\s+(.+)$`  | `Кагана`     |

Matching runs over **values, not columns**, so the column shuffle and blank
headers don't matter.

**Group by consonant skeleton.** To link the three wordings without a
dictionary, reduce each captured city name to a key:

1. lowercase; strip apostrophes (`'`, `ʻ`, `’`)
2. transliterate Cyrillic → Latin (`х→x`, `ж→j`, `ш→sh`, `ч→ch`, `ц→ts`,
   `қ→k`, `ғ→g`, `ў→o`, `ъ/ь→""`, …)
3. normalize digraphs/equivalents: `kh→x`, `q→k`, `dzh`/`dj→j`
4. drop vowels (`aeiouy`) — this also drops Russian case endings (`Кагана`)
5. collapse repeated letters

| Input                              | Key      |
| ---------------------------------- | -------- |
| Kogon / Кагана / Kogan             | `kgn`    |
| Xiva / Хивы / Khiva                | `xv`     |
| Buxoro / Бухары / Bukhara          | `bxr`    |
| Samarqand / Самарканда / Samarkand | `smrknd` |
| Toshkent / Ташкента / Tashkent     | `tshknt` |

**Known limit:** some pairs won't collapse (`Jizzax` → `jzx`, `Джизака` →
`jzk`). They show up as two chips until someone moves one phrase into the
other route (§5). This is a visible, one-click fix, never a silent wrong merge.

**Label.** The **English** city capture, as written by the bot (`Bus from Kogan` →
`Kogan`). Only while a route has no English phrase yet does it fall back to the
Uzbek stem, then the Russian capture; `autoLabel` lets sync swap in the English
name once an English rider appears.

### 4. Sync integration — additive only

After `mapSheetRows`, `syncEventAttendees`:

1. Collects the distinct bus phrases across all mapped rows.
2. Drops phrases already present in any route (so a human's grouping stands).
3. For each new phrase, finds a route with a phrase of the same skeleton key →
   appends to it; otherwise creates `{ label, autoLabel: true, phrases: [p], hidden: false }`.
4. For routes with `autoLabel: true`, recomputes the label from its phrases
   (so a route first seen in Uzbek becomes "Kogan" once an English rider appears).
5. Writes `busRoutes` only if something changed.

Sync never removes a phrase, renames a human-labeled route, or re-merges a
phrase that's already placed. Because `createEventFromSheet` already syncs
right after linking, detection runs at creation with no extra call.

**Concurrent edit vs. sync:** if a PATCH replaces `busRoutes` while a sync is
appending, a just-added phrase can be lost — the next sync (≤30 s) re-adds it,
because an unplaced phrase is always re-detected. Self-healing; no locking.

### 5. Editing (`EditEventDialog` → `BusRoutesEditor`)

Shown only when the event has routes. One row per route:

- **Label** input (editing sets `autoLabel: false`)
- **Phrase tags**, each with a **Move to…** menu: any other route, or "New route".
  Moving every phrase out of a route removes it. This one control covers
  both merge (move all) and split (move one to new). A new route starts labeled
  with the raw phrase and `autoLabel: true`, so the next sync renames it to the
  English city.
- **Hide** toggle

Saved through the existing `PATCH /events/:id`, and only when the routes
actually changed (so an untouched dialog can't clobber a phrase sync just
added). `updateEventSchema` gains `busRoutes`; Zod rejects an empty label, a
route with no phrases, a phrase in two routes, or two routes with the same
label. The event-update activity log entry also fires for `busRoutes` changes.

Why "move phrase" instead of "remove phrase": removing would just let the next
sync re-detect it and merge it straight back by skeleton. Moving pins it.

### 6. Kiosk (`AttendeeTable` → `BusRouteFilter`)

- Chips right of the search bar, one per non-hidden route:
  `[🚌 Kogan 34/50]` (printed / total on that route). No chips → nothing renders.
- Click selects; click again clears. One route at a time. If the selected route
  disappears (renamed or hidden elsewhere), the filter quietly resets to all.
- Filter composes with search inside `matchAll`: an attendee is on a route if
  any `extra` value is in that route's phrase set (a `Set` built once per
  roster/routes change, same pattern as `haystacks`).
- While a route is active, `AttendeeStats` receives the route's `total`/`came`,
  and select-all / batch print operate on the filtered `visible` list as they
  already do.
- Routes come from the event query, which already polls every 30 s, so a new
  chip appears on every station without a reload.

## Files touched

**Backend**

- `utils/columnLetter.ts` (new), `utils/busRoutes.ts` (new) — pure helpers
- `services/sheetSync.services.ts` — blank-header keys; additive route detection
- `models/event.model.ts` — `busRoutes` subdocument array
- `validators/event.validators.ts` — `busRoutes` on update, uniqueness refinement
- `scripts/verify` — cases below

**Frontend**

- `types.ts` — `BusRoute`, `AppEvent.busRoutes`
- `lib/busRoutes.ts` (new) — phrase→route lookup, per-route counts
- `components/BusRouteFilter.tsx` (new), `components/BusRoutesEditor.tsx` (new)
- `components/AttendeeTable.tsx`, `components/EditEventDialog.tsx`

## Verification (`npm run verify`)

- Blank-header columns land in `extra` under their column letters; nothing collides.
- A roster with `Kogondan Avtobusda`, `Автобус из Кагана`, `Bus from Kogan` yields
  **one** route labeled `Kogan` containing all three.
- A roster with Kogan and Khiva riders yields two routes.
- No-bus answers (`O'zim kelaman`, …) create no route.
- After a human rename (`autoLabel: false`), a resync keeps the label.
- A phrase moved to its own route stays there across a resync.
- PATCH rejects a phrase listed in two routes (400) and an empty label (400).

Frontend checked by hand on the Kogan and Khiva tabs: chip counts match the sheet
formula's row count; printing from the filtered view updates the chip's count.
