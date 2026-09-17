# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Roadshow Badge Printing** — an internal kiosk tool for staff at live IT Community of Uzbekistan events. Operator flow: pick an event → find an attendee → confirm printed status at a glance → print their badge → move on, fast and under pressure. Laptop/desktop browser only.

## Repos

**Two separate git repositories.** There is no monorepo and no root package manager — `cd` into each app.

| Path        | Repo                                | Stack                                                                                                        |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `frontend/` | `mirzakhalov03/itcomprint-frontend` | Vite + React 19 + TypeScript + Tailwind v4. Zustand (client state), React Query (server state).              |
| `backend/`  | `mirzakhalov03/itcomprint-backend`  | Express 5 + Mongoose 9 + Zod 4 on Node/TypeScript (CommonJS output (no "type": "module"), module: NodeNext). |

The folder containing both is **not** a repo — it is just a working directory. All cross-app documentation (this file, the design system, and every spec/plan) lives in **`frontend/docs/`** and is versioned with the frontend. The root `CLAUDE.md` is a symlink to `frontend/docs/CLAUDE.md` so it still loads when working from the parent folder.

**`git pull` in both app folders before starting work.** These local checkouts have drifted many commits behind their remotes before. `backend/CLAUDE.md` is the deeper backend reference and is kept current; this file is the whole-project picture.

## Commands

Frontend (`cd frontend`):

- `npm run dev` — Vite dev server (port 5173)
- `npm run build` — `tsc -b && vite build`
- `npm run validate` — prettier + eslint --fix + typecheck. Also `lint`, `format`, `typecheck` individually.

Backend (`cd backend`):

- `npm run dev` — `tsx watch src/server.ts` (port 4000). **Requires a reachable MongoDB** at `MONGODB_URI` (currently a MongoDB Atlas cluster).
- `npm run build` / `npm start` — compile to `dist/` then run
- `npm run verify` — **the project's test harness.** Spins up an in-memory MongoDB, boots the real app, and asserts every endpoint and error path. Run this after any backend change. There are no unit tests and, per project preference, none should be added.
- `npm run smoke` — builds, then boots the compiled `dist/server.js` in production mode against a throwaway Mongo; checks security headers, DB-aware health, graceful SIGTERM. Run before deploying — `verify` never exercises the real `server.ts` entrypoint.
- `npm run validate` — prettier + eslint --fix + typecheck.

Both apps run **husky + lint-staged on pre-commit**, so staged files are auto-formatted and linted.

Environment: `frontend/.env` (`VITE_API_URL`, `VITE_PRINTER_MODE`, `VITE_GOOGLE_CLIENT_ID`), `backend/.env` (`NODE_ENV`, `PORT`, `MONGODB_URI`, `CORS_ORIGIN`, `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `COOKIE_DOMAIN`). See `backend/.env.example`. `config/env.ts` Zod-validates at import time and exits on bad config.

## Architecture

### Printing pipeline (`frontend/src/printer/`)

The badge is **rasterized in the browser and sent to the printer as a bitmap** — the printer's built-in fonts are never used. The chain, in `usePrintAttendee`:

```
attendee + BadgeTemplate
  → renderBadgeToCanvas()      draws zones onto an HTMLCanvas at 203 DPI
  → canvasToMonochromeBitmap() 1-bit packed rows
  → buildBadgeTSPL()           TSPL header + BITMAP payload → Uint8Array
  → adapter.print()            PreviewPrinter or WebUsbPrinter
  → api.printAttendee()        marks printed, then invalidates ['attendees']
```

Why bitmaps: any font (including Cyrillic), arbitrary zone layout, and a preview that is pixel-identical to the print because both run the same canvas render. `PrintJob.tspl` is a `Uint8Array`, **not a string** — `TextEncoder` would corrupt bitmap bytes above 127.

`PrinterAdapter` has two implementations chosen at runtime by `VITE_PRINTER_MODE` via the `createPrinter` factory:

- `PreviewPrinter` — pushes the job into `usePreviewStore`, rendering `previewDataUrl` on screen (default; no hardware). Always reports `connected`.
- `WebUsbPrinter` — raw bulk-OUT transfer to a Gainscha label printer (Chrome/Edge only).

UI code never branches on printer type. **`DPI = 203` is still an unverified assumption** — it is hardcoded in both `renderBadge.ts` and `buildBadgeTSPL.ts`, and with a bitmap pipeline a wrong DPI makes the badge physically the wrong size. Confirm on real hardware and change both.

### Badge templates

A `BadgeTemplate` is a label size (`labelWidthMm`/`labelHeightMm`) plus an ordered list of **zones**. A zone is either a `field` (pulls `fullName` or an `extra` key off the attendee) or `static` text, each with `fontFamily`, `fontSize` (pt), `bold`, `align`, `hidden`.

- **A default template is auto-seeded**: `ensureDefaultTemplate()` upserts the default once at boot (`server.ts`); a partial unique index allows only one, so `GET /templates` always returns at least "Default badge". The default cannot be deleted (400). Kiosk and editor previews render through `useBadgeCanvas` (the real print raster). Zone text lives in `printer/zones.ts`.
- **Events reference a template** via `templateId`; `null` means "use the default". Deleting a custom template resets referencing events back to `null`.
- `GET /templates/field-keys` aggregates the **distinct `extra` keys across all attendees** to populate the editor's field picker.
- `TemplateEditor` renders live through the same `renderBadgeToCanvas` against `SAMPLE_ATTENDEE`, so the editor preview and the printed badge cannot drift.
- **Legacy zones** (created before `fontFamily`/`type` existed) are upgraded by `normalizeLegacyZone`. It detects legacy zones by the **absence** of those fields — never by `fontSize` magnitude, since the new pt scale includes `8`, which would collide with the old 1–8 scale's max and silently remap a real 8pt zone to 24pt.

### App shell and routing

- `/login` — `LandingPage` (public marketing + Google sign-in)
- `/onboarding` — first-login display-name confirm
- `/app` — `DashboardLayout` (persistent sidebar) wrapping `DashboardPage` (index), `/app/printer`, `/app/templates`, `/app/settings`
- `/app/events/:id` — `KioskPage`, a **sibling route deliberately outside the layout** so the kiosk is full-screen with no sidebar. It is a split view: `AttendeeTable` beside `BadgePrintPanel`.
- Everything else redirects to `/app`. `<RequireAuth>` gates all authed routes.
- `<Toast />` is mounted once in `App.tsx`. Modals use `components/ui/Dialog.tsx` / `ConfirmDialog.tsx`.

### Data flow

- **Import is client-side**: `ImportDialog` parses the spreadsheet with `xlsx` in the browser (lazy-loaded — it is a ~370KB chunk), the operator picks the name column, and the whole event + attendee array is POSTed in one request. There is intentionally **no per-attendee create endpoint** — events are always created _with_ their attendees (`createEventWithAttendees` → `insertMany`). Walk-in attendees are therefore not supported.
- **Attendees load once per event; search and filtering are client-side** (`useAttendees` fetches the full roster, `AttendeeTable` filters in memory) so keystrokes never hit the network. The roster endpoint takes no query params: search and filtering are client-side only.
- **Print and reprint are the same endpoint**: `POST /attendees/:id/print` `$inc`s `printCount` and sets `printStatus: 'printed'`. The UI shows "Print" → "Reprint" based on status.
- **Printing patches the cache**: `usePrintAttendee` writes the returned attendee into `['attendees', eventId]` instead of refetching. **Sheet-linked kiosks are live**: `useSheetSync` pulls the sheet every 30 s and polls the roster (10 s) and events (30 s), so stations see each other's prints and template switches. Polling pauses in hidden tabs.
- `listEvents` derives `attendeeCount` and `printedCount` via aggregation; neither is stored.

### Auth (self-hosted Google)

Google Identity Services on the frontend → ID token → `POST /api/auth/google`, which the backend verifies with `google-auth-library`, upserts a `User`, and returns a signed-JWT session in an httpOnly `session` cookie. The frontend reads `GET /api/auth/me` via the `['auth','me']` React Query key. `/events`, `/attendees` and `/templates` all require the session; events are stamped with the author's denormalized `authorName`/`authorPicture`. Sign-in is open to any Google account today — the guard and `verifyGoogleIdToken` are structured so a domain/allowlist restriction is a small later change.

### Backend layering (`backend/src/`)

Strict MVC: `routes → controllers → services → models`, with `validators/` (Zod), `middlewares/`, `config/`, `utils/`. Conventions:

- Routes attach `validate(schema, part)` then the handler **directly**. There is **no `asyncHandler` wrapper** — Express 5 forwards rejected promises from async handlers to the error middleware automatically, so it was deleted as redundant. Don't reintroduce it.
- **Throw `new AppError(status, message)` from services** for expected failures (e.g. `throw new AppError(404, 'Template not found')`) rather than returning `null` and shaping a status in the controller. Controllers stay thin.
- `errorHandler` maps `AppError` → its status, `ZodError` → 400 with flattened details, Mongoose `CastError`/`ValidationError` → 400, anything carrying an HTTP `status`/`statusCode` → that status, everything else → 500. **500 messages are hidden in production** — don't echo `err.message` to clients.
- `config/env.ts` validates `process.env` with Zod at startup — fail fast on missing config.
- **Express 5 gotcha**: `req.query` is a getter-only property. The `validate` middleware uses `Object.defineProperty` instead of assignment — don't "simplify" it back to `req.query = parsed`, it throws.

## Design system

`docs/layout.md` (behavioral contract — what must exist), `docs/brand.md` (visual identity — node/circuit motif), and `docs/design.md` (the synthesis: tokens, component specs, status semantics) define the design. The system **is implemented**: the full token set lives in `frontend/src/index.css` under Tailwind v4's `@theme` block (there is no `tailwind.config.js`), and components consume the generated utilities (`bg-surface`, `text-ink`, `text-brand`, etc.). Shared primitives live in `frontend/src/components/ui/`.

- **`index.css` `@theme` is the source of truth for colors**, not the prose hexes in `docs/brand.md`/`docs/design.md` — those have drifted (e.g. brand green is `#88bd55` in tokens, written as `#6CBE45` in docs). Use the token names, never raw hex in components.
- Design principles still hold: light work surface, dark branded frame (`ink` family), green as accent not fill, printed-vs-not-printed distinguished by weight + glyph (not hue alone, for color-blind safety; `amber` = not-printed, `brand` = printed).

## Known gaps

- **The hardware spike has never been run.** `VITE_PRINTER_MODE=preview` everywhere; the Gainscha's real DPI, USB VID/PID, and the Windows WinUSB binding are all unconfirmed. Nothing has physically printed.
- **No walk-in attendee support** — see Data flow above.
- Batch print runs sequentially; failures don't stop the run and stay selected for retry.
