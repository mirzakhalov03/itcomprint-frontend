# Dashboard + Sidebar Shell — Design

**Date:** 2026-06-23
**Status:** Approved (design)
**Repos:** `itcomprint-frontend` (primary), `itcomprint-backend` (one aggregation change)

## Problem

After login the app drops the operator straight into a single event's attendee
table (`KioskPage`), with the event picker and spreadsheet import living in a top
`EventBar`. There is no "home." We want a real landing view after login: a
**dashboard that lists events with stats**, framed by a **persistent sidebar**,
with the badge-printing kiosk as a focused full-screen mode entered per event.

## Goals

- A dashboard home showing all events as cards with stats (attendees, printed,
  remaining) and author.
- A dark, branded **sidebar shell** (Dashboard / Printer / Settings) wrapping the
  non-kiosk views.
- Keep the kiosk **full-screen** (no sidebar) for use at a busy registration desk.
- Move event creation (spreadsheet import) to the dashboard.

## Non-goals

- No per-attendee CRUD (backend intentionally has none).
- No new auth/roles, no multi-user admin.
- No separate "Events" management section — the Dashboard _is_ the events view.
- No unit tests (project preference). Backend changes verified via `npm run verify`.

## Navigation model

A React Router 7 **layout route** wraps the shell; the kiosk is a **sibling route
outside** the layout so it renders full-screen with no conditional chrome logic.

```
/login                          public
/onboarding                     RequireAuth
/app                            RequireAuth → DashboardLayout (sidebar + header + <Outlet/>)
    index                         DashboardPage   (events overview + stats)
    /printer                      PrinterPage
    /settings                     SettingsPage
/app/events/:id                 RequireAuth → KioskPage (full-screen, NO layout)
*                               → /app
```

Rejected alternative: a single `AppShell` that conditionally hides the sidebar by
route. It tangles layout with routing and degrades with every new section.

## Visual language

Reuse existing Tailwind design tokens (`bg-ink`, `bg-surface`, `bg-brand`,
`font-display`, `text-ink/muted/faint`, `border-line`). No new global styles.

- **Sidebar** — dark (`bg-ink`), reuses the node-mesh SVG texture currently in
  `Header`. Top: brand logo lockup reading **"IT Community Registration"**.
  Middle: nav items with brand-green active state. Bottom: user avatar + name.
- **Header bar** — dark, spans the content column (right of the sidebar). Holds
  the contextual page title + an always-glanceable printer-status chip.
- **Workspace** — light (`bg-surface`), renders the routed page via `<Outlet/>`.
- **Kiosk** — its own slim dark header (back + event name + printer status) over
  the light attendee table + badge preview tray.

## Components

### New

| Component                        | Purpose                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `components/DashboardLayout.tsx` | Shell: `<Sidebar/>` + dark header + `<Outlet/>`.                                                      |
| `components/Sidebar.tsx`         | Dark nav: logo/title, `NavLink` items, user footer.                                                   |
| `pages/DashboardPage.tsx`        | Events overview grid + "New event / Import" action + empty state.                                     |
| `components/EventCard.tsx`       | One event: name, date, stats (attendees · printed ✓ · remaining), author; links to `/app/events/:id`. |
| `pages/PrinterPage.tsx`          | Connect/disconnect, current adapter (preview vs WebUSB), status. Backed by `printerStore`.            |
| `pages/SettingsPage.tsx`         | Display-name edit (`useUpdateName`) + logout (`useLogout`).                                           |

### Refactored

- **`App.tsx`** — new route tree above (layout route + sibling kiosk route).
- **`KioskPage.tsx`** — reads `:id` via `useParams` instead of local state; removes
  `<EventBar/>` (selector + import gone — now on the dashboard); gains a slim dark
  header with a back-to-dashboard control + event name + printer status.

### Retired from their current role

- **`Header.tsx`** — its branding/texture moves into `Sidebar`; its `PrinterStatus`
  and `UserMenu` slots move into the header chip / sidebar footer / Settings page.
  Mesh SVG is extracted for reuse (e.g. a small `BrandMesh` or shared snippet).
- **`EventBar.tsx`** / **`EventSelector.tsx`** — no longer used in the kiosk. Event
  selection now happens by clicking a card on the dashboard. Remove once unreferenced.

### Reused as-is

`ImportDialog` (lazy), `AttendeeTable`, `BadgePreviewTray`, `Toast`, `PrinterStatus`
(as the header chip + basis for `PrinterPage`), `UserMenu` (basis for sidebar footer

- Settings), and all hooks/stores (`useEvents`, `useAttendees`, `usePrintAttendee`,
  `useAuth`, `printerStore`, `previewStore`, `toastStore`).

## Data flow

- **Dashboard** uses the existing `useEvents()` query — now returning `printedCount`
  per event in addition to `attendeeCount`. Remaining is derived client-side
  (`attendeeCount - printedCount`).
- **Import flow**: dashboard action opens `ImportDialog` → existing create-event
  mutation → on success, **navigate into the new event's kiosk** (`/app/events/:id`).
- **Kiosk** scopes all attendee queries to the `:id` route param.
- **Printer / Settings** read from `printerStore` / `useAuth` respectively; no new
  network surface.

## Backend change (small)

`itcomprint-backend` — `services/event.services.ts` `listEvents`: the existing
`$group` aggregation that derives `attendeeCount` also emits `printedCount`:

```ts
printedCount: {
  $sum: {
    $cond: [{ $eq: ['$printStatus', 'printed'] }, 1, 0];
  }
}
```

- Include `printedCount` in the event controller response shape.
- No new endpoints, no schema change (`printStatus` already exists on Attendee).
- Frontend `types.ts` `AppEvent` gains `printedCount?: number`.
- Run `npm run verify` after (asserts every endpoint/error path), per backend convention.

## Resolved decisions

- **Printer & Settings are real (minimal) pages**, not stubs — they relocate
  existing `PrinterStatus` / `UserMenu` logic, so cost is low.
- **Import auto-enters the new event's kiosk** — printing is always the next action.
- **Dashboard and Events are merged** — one overview view, no separate section.

## Edge cases

- **No events** → dashboard empty state inviting import (reuse current copy).
- **Unknown `/app/events/:id`** (deleted/invalid) → kiosk shows a not-found state
  with a back-to-dashboard control rather than erroring.
- **Logged out mid-session** → `RequireAuth` + `api.me` returning `null` already
  redirect to `/login`; unchanged.
- **Printer disconnected** → header chip + `PrinterPage` reflect status; printing
  guarded as today.

## Out-of-scope / future

- Dashboard activity feed / charts.
- Collapsible sidebar.
- Settings app-preferences beyond display name.
