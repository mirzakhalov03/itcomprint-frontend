# Dashboard + Sidebar Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a post-login dashboard (events overview + stats) framed by a dark branded sidebar shell, with the badge-printing kiosk as a focused full-screen per-event mode.

**Architecture:** A React Router 7 layout route (`DashboardLayout` = sidebar + dark header + `<Outlet/>`) wraps the Dashboard/Printer/Settings sections. The kiosk is a sibling route *outside* the layout so it renders full-screen with no conditional chrome. A small backend aggregation change adds `printedCount` per event for the dashboard stats.

**Tech Stack:** React 19, React Router 7, React Query, Zustand, Tailwind v4. Backend: Express 5 + Mongoose 9 + Zod 4 (TypeScript ESM).

## Global Constraints

- **Two separate git repos.** Frontend work happens in `itcomprint-frontend` on branch `feat/dashboard-shell` (already created). Backend work happens in `itcomprint-backend` on a new branch `feat/event-printed-count`.
- **No frontend unit tests** — project preference. Frontend verification per task = `npm run lint` then `npm run build` (runs `tsc -b && vite build`; must finish with no type/lint errors), plus a manual `npm run dev` eyeball.
- **Backend: run `npm run verify` after any change** (in-memory Mongo; exercises every endpoint). Must end `ALL PASSED`.
- **Reuse existing Tailwind design tokens** from `src/index.css` (`bg-ink`, `bg-surface`, `bg-brand`, `text-faint`, `border-line`, `font-display`, etc.). Do **not** add new global CSS.
- **Sidebar brand title** reads exactly **"IT Community"** / **"Registration"** (two lines).
- **Node `>=22`** (backend `engines`).
- **Commit message trailer** on every commit:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Backend — `printedCount` per event

Extend the `listEvents` aggregation to also count printed attendees, so the dashboard can show printed/remaining. The controller already returns the service result verbatim, so only the service + the verify harness change.

**Repo:** `itcomprint-backend`

**Files:**
- Modify: `src/services/event.services.ts` (`listEvents`, lines 32-39)
- Modify: `scripts/verify.ts` (the `GET /events` assertion ~line 144-145; add a post-print re-list ~line 200)

**Interfaces:**
- Produces: `listEvents()` returns `Array<Event & { attendeeCount: number; printedCount: number }>`. The frontend `AppEvent` type (Task 4) relies on `printedCount: number` being present on each listed event.

- [ ] **Step 1: Create the backend branch**

```bash
cd /c/Users/J.Mirzakhalov/Desktop/itcomprint/itcomprint-backend
git checkout -b feat/event-printed-count
```

- [ ] **Step 2: Update `listEvents` to aggregate `printedCount`**

Replace the body of `listEvents` in `src/services/event.services.ts` with:

```ts
export async function listEvents() {
  const events = await EventModel.find().sort({ date: -1 }).lean();
  const counts = await AttendeeModel.aggregate<{ _id: unknown; count: number; printed: number }>([
    {
      $group: {
        _id: '$eventId',
        count: { $sum: 1 },
        printed: { $sum: { $cond: [{ $eq: ['$printStatus', 'printed'] }, 1, 0] } },
      },
    },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c]));
  return events.map((e) => {
    const c = countMap.get(String(e._id));
    return { ...e, attendeeCount: c?.count ?? 0, printedCount: c?.printed ?? 0 };
  });
}
```

- [ ] **Step 3: Strengthen the verify assertions**

In `scripts/verify.ts`, replace the existing list-events assertion (currently around line 144-145):

```ts
    // list events → attendeeCount present
    const events = await afetch('/events').then((r) => r.json());
    check('GET /events → array with attendeeCount=2', Array.isArray(events) && events[0]?.attendeeCount === 2, events);
```

with:

```ts
    // list events → attendeeCount + printedCount present (nothing printed yet)
    const events = await afetch('/events').then((r) => r.json());
    check(
      'GET /events → attendeeCount=2, printedCount=0',
      Array.isArray(events) && events[0]?.attendeeCount === 2 && events[0]?.printedCount === 0,
      events,
    );
```

Then, immediately after the "status filter reflects the print" block (after the `printedList` check, ~line 200), add:

```ts
    // list events again → printedCount reflects the print
    const eventsAfterPrint = await afetch('/events').then((r) => r.json());
    check(
      'GET /events after print → printedCount=1',
      eventsAfterPrint[0]?.printedCount === 1,
      eventsAfterPrint,
    );
```

- [ ] **Step 4: Run verify**

```bash
npm run verify
```

Expected: ends with `ALL PASSED: <n> passed, 0 failed`, including the two new `printedCount` checks.

- [ ] **Step 5: Commit**

```bash
git add src/services/event.services.ts scripts/verify.ts
git commit -m "$(printf 'feat(events): add printedCount to listEvents aggregation\n\nDashboard needs printed/remaining per event. Extends the $group\nwith a $cond sum on printStatus and asserts it in verify.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: Frontend — shell chrome (icons, Sidebar, DashboardLayout, placeholder pages)

Build the dark sidebar + dark header shell and minimal placeholder section pages. Not wired into routing yet (Task 3), so the app is unchanged at runtime; this task's gate is that everything type-checks and builds.

**Repo:** `itcomprint-frontend` (branch `feat/dashboard-shell`)

**Files:**
- Modify: `src/components/icons.tsx` (add `GridIcon`, `SettingsIcon`, `ArrowLeftIcon`, `UsersIcon`, `CalendarIcon`)
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/DashboardLayout.tsx`
- Create: `src/pages/DashboardPage.tsx` (placeholder)
- Create: `src/pages/PrinterPage.tsx` (placeholder)
- Create: `src/pages/SettingsPage.tsx` (placeholder)

**Interfaces:**
- Consumes: existing `NodeMesh`, `PrinterIcon` from `./icons`; `UserMenu` from `./UserMenu`; `PrinterStatus` from `./PrinterStatus`.
- Produces: `Sidebar` (no props), `DashboardLayout` (no props; renders `<Outlet/>`), `DashboardPage`/`PrinterPage`/`SettingsPage` (no props). New icon components with the standard `IconProps` signature (`{ size?, className?, strokeWidth? }`).

- [ ] **Step 1: Add the new icons**

Append to `src/components/icons.tsx` (before the `NodeMesh` block — they use the same `Svg` wrapper already defined in the file):

```tsx
export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </Svg>
);

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </Svg>
);
```

- [ ] **Step 2: Create `Sidebar`**

Create `src/components/Sidebar.tsx`:

```tsx
import { NavLink } from 'react-router-dom';
import { NodeMesh, GridIcon, PrinterIcon, SettingsIcon } from './icons';
import { UserMenu } from './UserMenu';

const navItem = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-display text-sm font-semibold transition-colors ${
    isActive ? 'bg-brand text-white' : 'text-faint hover:bg-white/5 hover:text-white'
  }`;

/** Dark branded shell rail: brand lockup, section nav, signed-in user. */
export function Sidebar() {
  return (
    <aside className="relative flex h-full w-[244px] shrink-0 flex-col overflow-hidden bg-ink">
      <NodeMesh className="pointer-events-none absolute inset-x-0 top-0 h-24 w-full opacity-40" />

      <div className="relative flex items-center gap-[13px] px-5 pb-6 pt-6">
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] bg-brand">
          <img src="/brand/itcomuz-icon-white.png" alt="ITCOMUZ" className="h-[26px] w-[26px] object-contain" />
        </div>
        <div className="flex flex-col gap-px">
          <span className="font-display text-[14px] font-bold leading-tight text-white">IT Community</span>
          <span className="font-display text-[14px] font-bold leading-tight text-white">Registration</span>
        </div>
      </div>

      <nav className="relative flex flex-1 flex-col gap-1 px-3">
        <NavLink to="/app" end className={navItem}>
          <GridIcon size={18} /> Dashboard
        </NavLink>
        <NavLink to="/app/printer" className={navItem}>
          <PrinterIcon size={18} /> Printer
        </NavLink>
        <NavLink to="/app/settings" className={navItem}>
          <SettingsIcon size={18} /> Settings
        </NavLink>
      </nav>

      <div className="relative border-t border-white/10 px-4 py-4">
        <UserMenu />
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Create `DashboardLayout`**

Create `src/components/DashboardLayout.tsx`:

```tsx
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PrinterStatus } from './PrinterStatus';

const TITLES: Record<string, string> = {
  '/app': 'Dashboard',
  '/app/printer': 'Printer',
  '/app/settings': 'Settings',
};

/** Persistent shell: dark sidebar + dark header bar + light routed workspace. */
export function DashboardLayout() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? 'Dashboard';

  return (
    <div className="flex h-screen overflow-hidden bg-surface text-ink">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between bg-ink px-6">
          <span className="font-display text-[15px] font-bold tracking-[.04em] text-white">{title}</span>
          <PrinterStatus />
        </header>
        <main className="flex-1 overflow-y-auto px-6 pb-7 pt-5">
          <div className="mx-auto max-w-[1120px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create placeholder pages**

Create `src/pages/DashboardPage.tsx`:

```tsx
export function DashboardPage() {
  return <div className="text-sm text-muted">Dashboard — coming up next.</div>;
}
```

Create `src/pages/PrinterPage.tsx`:

```tsx
export function PrinterPage() {
  return <div className="text-sm text-muted">Printer — coming up next.</div>;
}
```

Create `src/pages/SettingsPage.tsx`:

```tsx
export function SettingsPage() {
  return <div className="text-sm text-muted">Settings — coming up next.</div>;
}
```

- [ ] **Step 5: Lint + build**

```bash
cd /c/Users/J.Mirzakhalov/Desktop/itcomprint/itcomprint-frontend
npm run lint && npm run build
```

Expected: no lint errors; `tsc -b && vite build` completes successfully (the new components are type-correct even though nothing imports them yet).

- [ ] **Step 6: Commit**

```bash
git add src/components/icons.tsx src/components/Sidebar.tsx src/components/DashboardLayout.tsx src/pages/DashboardPage.tsx src/pages/PrinterPage.tsx src/pages/SettingsPage.tsx
git commit -m "$(printf 'feat(shell): add sidebar + dashboard layout chrome\n\nDark branded sidebar (IT Community Registration) + dark header bar\nover a light workspace, plus placeholder section pages and new icons.\nNot yet routed.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: Frontend — routing rewire + kiosk refactor + retire old chrome

Wire the layout route + sibling kiosk route, refactor `KioskPage` to read its event from the `:id` URL param (dropping the in-kiosk event selector/import), and delete the now-unreferenced `Header`, `EventBar`, `EventSelector`. After this task, navigation works end-to-end (section pages still placeholders).

**Repo:** `itcomprint-frontend` (branch `feat/dashboard-shell`)

**Files:**
- Modify: `src/App.tsx` (whole file)
- Modify: `src/pages/KioskPage.tsx` (whole file)
- Delete: `src/components/Header.tsx`, `src/components/EventBar.tsx`, `src/components/EventSelector.tsx`

**Interfaces:**
- Consumes: `DashboardLayout`, `DashboardPage`, `PrinterPage`, `SettingsPage` (Task 2); existing `RequireAuth`, `AttendeeTable`, `BadgePreviewTray`, `Toast`, `PrinterStatus`, `useEvents`, `ArrowLeftIcon`.
- Produces: route `/app/events/:id` rendering a full-screen `KioskPage` that reads `id` via `useParams`.

- [ ] **Step 1: Rewrite `App.tsx` routing**

Replace the entire contents of `src/App.tsx` with:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { KioskPage } from './pages/KioskPage';
import { DashboardLayout } from './components/DashboardLayout';
import { DashboardPage } from './pages/DashboardPage';
import { PrinterPage } from './pages/PrinterPage';
import { SettingsPage } from './pages/SettingsPage';
import { RequireAuth } from './components/RequireAuth';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <OnboardingPage />
            </RequireAuth>
          }
        />

        {/* Shell sections share the persistent sidebar layout */}
        <Route
          path="/app"
          element={
            <RequireAuth>
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="printer" element={<PrinterPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Kiosk is full-screen — a sibling route, NOT under the layout */}
        <Route
          path="/app/events/:id"
          element={
            <RequireAuth>
              <KioskPage />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Rewrite `KioskPage` to be event-scoped and full-screen**

Replace the entire contents of `src/pages/KioskPage.tsx` with:

```tsx
import { Link, useParams } from 'react-router-dom';
import { AttendeeTable } from '../components/AttendeeTable';
import { BadgePreviewTray } from '../components/BadgePreviewTray';
import { Toast } from '../components/Toast';
import { PrinterStatus } from '../components/PrinterStatus';
import { ArrowLeftIcon } from '../components/icons';
import { useEvents } from '../hooks/useEvents';

/** Full-screen, single-event badge-printing view. Event comes from the URL. */
export function KioskPage() {
  const { id } = useParams<{ id: string }>();
  const { data: events = [], isLoading } = useEvents();
  const event = events.find((e) => e._id === id);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-ink">
      <header className="flex h-16 shrink-0 items-center justify-between bg-ink px-6">
        <div className="flex items-center gap-3.5">
          <Link
            to="/app"
            aria-label="Back to dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-faint transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeftIcon size={18} />
          </Link>
          <span className="font-display text-[15px] font-bold tracking-[.02em] text-white">
            {event?.name ?? 'Event'}
          </span>
        </div>
        <PrinterStatus />
      </header>

      <div className="flex-1 overflow-y-auto px-6 pb-7 pt-5">
        <div className="mx-auto max-w-[1120px]">
          {id && (event || isLoading) ? (
            <AttendeeTable key={id} eventId={id} eventName={event?.name} />
          ) : (
            <div className="rounded-2xl border border-line bg-white px-6 py-20 text-center">
              <div className="font-display text-[17px] font-bold text-ink-3">Event not found</div>
              <div className="mt-1.5 text-sm text-muted">
                It may have been removed.{' '}
                <Link to="/app" className="font-semibold text-brand-deep underline">
                  Back to dashboard
                </Link>
                .
              </div>
            </div>
          )}
        </div>
      </div>

      <BadgePreviewTray />
      <Toast />
    </div>
  );
}
```

- [ ] **Step 3: Delete the retired chrome**

```bash
cd /c/Users/J.Mirzakhalov/Desktop/itcomprint/itcomprint-frontend
git rm src/components/Header.tsx src/components/EventBar.tsx src/components/EventSelector.tsx
```

- [ ] **Step 4: Lint + build (catches any lingering references)**

```bash
npm run lint && npm run build
```

Expected: builds clean. If the build reports an unresolved import of `Header`/`EventBar`/`EventSelector`, grep for it (`git grep EventBar`) and remove the reference — there should be none outside the deleted files.

- [ ] **Step 5: Manual check**

```bash
npm run dev
```

Sign in. Confirm: lands on `/app` with the dark sidebar (Dashboard active) + dark header; clicking Printer/Settings swaps the placeholder content and updates the header title; visiting `/app/events/<a-real-id>` shows the full-screen kiosk (no sidebar) with a working back arrow; an unknown id shows the "Event not found" state.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(printf 'feat(shell): route the dashboard layout and full-screen kiosk\n\nLayout route for Dashboard/Printer/Settings; kiosk becomes a sibling\nfull-screen route scoped by :id. Retires Header/EventBar/EventSelector.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: Frontend — Dashboard events overview + import auto-enter

Flesh out `DashboardPage` with an event-card grid + stats, move spreadsheet import here, and auto-enter the new event's kiosk on success. Add `printedCount` to the `AppEvent` type and extend `ImportDialog` with an `onImported` callback.

**Repo:** `itcomprint-frontend` (branch `feat/dashboard-shell`)

**Files:**
- Modify: `src/types.ts` (`AppEvent`)
- Create: `src/components/EventCard.tsx`
- Modify: `src/components/ImportDialog.tsx` (props + success path)
- Modify: `src/pages/DashboardPage.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `useEvents` (`{ data: AppEvent[] }`), `useCreateEvent` (already used inside `ImportDialog`), `UploadIcon`, `CalendarIcon`, `UsersIcon`, `CheckIcon`.
- Produces: `EventCard({ event: AppEvent })`; `ImportDialog({ onClose: () => void; onImported?: (event: AppEvent) => void })`. `AppEvent` gains `printedCount?: number`.

- [ ] **Step 1: Add `printedCount` to the `AppEvent` type**

In `src/types.ts`, add the field to `AppEvent`:

```ts
export interface AppEvent {
  _id: string;
  name: string;
  date: string;
  createdAt: string;
  attendeeCount?: number;
  printedCount?: number;
  authorName?: string;
  authorPicture?: string;
}
```

- [ ] **Step 2: Create `EventCard`**

Create `src/components/EventCard.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { CalendarIcon, CheckIcon, UsersIcon } from './icons';
import type { AppEvent } from '../types';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** One event tile on the dashboard. Clicking opens its full-screen kiosk. */
export function EventCard({ event }: { event: AppEvent }) {
  const total = event.attendeeCount ?? 0;
  const printed = event.printedCount ?? 0;
  const remaining = Math.max(total - printed, 0);

  return (
    <Link
      to={`/app/events/${event._id}`}
      className="group flex flex-col rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.04)] transition-all hover:border-brand-line hover:shadow-[0_8px_24px_rgba(0,0,0,.06)]"
    >
      <div className="font-display text-[17px] font-bold text-ink group-hover:text-brand-deep">
        {event.name}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-sm text-muted">
        <CalendarIcon size={14} className="text-faint" />
        {fmtDate(event.date)}
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-line-3 pt-3.5 text-[13px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink-3">
          <UsersIcon size={15} className="text-faint" /> {total}
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-brand-deep">
          <CheckIcon size={14} /> {printed}
        </span>
        <span className="font-semibold text-amber-ink">{remaining} left</span>
      </div>

      {event.authorName && <div className="mt-3 text-xs text-faint">by {event.authorName}</div>}
    </Link>
  );
}
```

- [ ] **Step 3: Add `onImported` to `ImportDialog`**

In `src/components/ImportDialog.tsx`:

First, add `AppEvent` to the type import (line 6):

```tsx
import type { AppEvent, NewAttendee } from '../types';
```

Change the component signature (line 10):

```tsx
export function ImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: (event: AppEvent) => void;
}) {
```

Replace the tail of `handleImport` (the `await createEvent.mutateAsync(...)` line and the two lines after it, lines 47-49) with:

```tsx
    const created = await createEvent.mutateAsync({ name: eventName.trim(), date: eventDate, attendees });
    toast('Event imported');
    if (onImported) onImported(created);
    else onClose();
```

- [ ] **Step 4: Replace the `DashboardPage` placeholder**

Replace the entire contents of `src/pages/DashboardPage.tsx` with:

```tsx
import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEvents } from '../hooks/useEvents';
import { EventCard } from '../components/EventCard';
import { UploadIcon } from '../components/icons';
import type { AppEvent } from '../types';

// Lazy so the ~500KB xlsx parser only loads when an operator opens Import.
const ImportDialog = lazy(() =>
  import('../components/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);

export function DashboardPage() {
  const { data: events = [], isLoading } = useEvents();
  const [importing, setImporting] = useState(false);
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-ink">Events</h1>
        <button
          onClick={() => setImporting(true)}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-[18px] font-display text-sm font-bold text-white transition-colors hover:bg-brand-strong"
        >
          <UploadIcon size={16} /> New event
        </button>
      </div>

      {isLoading ? (
        <div className="px-6 py-16 text-center text-sm text-muted">Loading events…</div>
      ) : events.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e._id} event={e} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-white px-6 py-20 text-center">
          <div className="font-display text-[17px] font-bold text-ink-3">No events yet</div>
          <div className="mt-1.5 text-sm text-muted">
            Import a spreadsheet to create your first event.
          </div>
        </div>
      )}

      {importing && (
        <Suspense fallback={null}>
          <ImportDialog
            onClose={() => setImporting(false)}
            onImported={(event: AppEvent) => {
              setImporting(false);
              navigate(`/app/events/${event._id}`);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Lint + build**

```bash
npm run lint && npm run build
```

Expected: builds clean.

- [ ] **Step 6: Manual check**

```bash
npm run dev
```

On `/app`: existing events render as cards with name, date, and `total · printed · N left` stats; "New event" opens the import dialog; completing an import drops you straight into the new event's full-screen kiosk; the empty state shows when there are no events.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/components/EventCard.tsx src/components/ImportDialog.tsx src/pages/DashboardPage.tsx
git commit -m "$(printf 'feat(dashboard): events overview with stats + import auto-enter\n\nEvent-card grid (attendees/printed/remaining), New event moved here,\nand importing navigates straight into the new events kiosk.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: Frontend — Printer & Settings pages

Replace the two remaining placeholders with real (minimal) pages. Printer surfaces connection state + a Connect action from `printerStore`; Settings edits the display name and signs out.

**Repo:** `itcomprint-frontend` (branch `feat/dashboard-shell`)

**Files:**
- Modify: `src/pages/PrinterPage.tsx` (replace placeholder)
- Modify: `src/pages/SettingsPage.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `usePrinterStore` (`{ adapter, status, connect }`), `toast`, `PrinterIcon`, `PlugIcon`; `useAuth`/`useUpdateName`/`useLogout`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Build `PrinterPage`**

Replace the entire contents of `src/pages/PrinterPage.tsx` with:

```tsx
import { usePrinterStore } from '../store/printerStore';
import { toast } from '../store/toastStore';
import { PlugIcon, PrinterIcon } from '../components/icons';

export function PrinterPage() {
  const { adapter, status, connect } = usePrinterStore();
  const preview = adapter.kind === 'preview';
  const connected = status === 'connected';

  async function handleConnect() {
    await connect();
    const s = usePrinterStore.getState();
    if (s.status === 'connected') toast('Printer connected');
    else if (s.error) toast(s.error);
  }

  const label = preview ? 'Preview mode' : connected ? 'Connected' : 'Not connected';
  const desc = preview
    ? 'Badges render to the on-screen preview tray. No physical printer is attached.'
    : connected
      ? 'A label printer is connected over WebUSB and ready to print.'
      : 'Connect your Gainscha label printer over USB to start printing badges.';

  const iconBox = connected
    ? 'bg-brand text-white'
    : preview
      ? 'bg-ink-2 text-white'
      : 'bg-surface text-muted';

  return (
    <div className="max-w-[560px]">
      <h1 className="mb-5 font-display text-xl font-bold text-ink">Printer</h1>
      <div className="rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconBox}`}>
            <PrinterIcon size={20} />
          </div>
          <div>
            <div className="font-display text-base font-bold text-ink">{label}</div>
            <div className="text-xs uppercase tracking-wide text-faint">
              {adapter.kind === 'webusb' ? 'WebUSB' : 'Preview'}
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted">{desc}</p>
        {adapter.kind === 'webusb' && !connected && (
          <button
            onClick={handleConnect}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 font-display text-sm font-bold text-white transition-colors hover:bg-brand-strong"
          >
            <PlugIcon size={16} /> Connect printer
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build `SettingsPage`**

Replace the entire contents of `src/pages/SettingsPage.tsx` with:

```tsx
import { useState } from 'react';
import { useAuth, useLogout, useUpdateName } from '../hooks/useAuth';
import { toast } from '../store/toastStore';

export function SettingsPage() {
  const { user } = useAuth();
  const update = useUpdateName();
  const logout = useLogout();
  const [name, setName] = useState('');

  if (!user) return null;
  const value = name || user.displayName;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    update.mutate(trimmed, { onSuccess: () => toast('Name updated') });
  };

  return (
    <div className="max-w-[560px]">
      <h1 className="mb-5 font-display text-xl font-bold text-ink">Settings</h1>

      <form onSubmit={save} className="rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center gap-3">
          {user.picture ? (
            <img
              src={user.picture}
              alt=""
              className="h-12 w-12 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-base font-bold text-white">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-display text-base font-bold text-ink">{user.displayName}</div>
            <div className="text-sm text-muted">{user.email}</div>
          </div>
        </div>

        <label className="mt-5 flex flex-col gap-1.5">
          <span className="font-display text-xs font-semibold text-ink-3">
            Display name (shown as event author)
          </span>
          <input
            value={value}
            onChange={(e) => setName(e.target.value)}
            className="h-[42px] rounded-[10px] border border-line-2 bg-surface px-3 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <button
          type="submit"
          disabled={update.isPending || !value.trim()}
          className="mt-4 inline-flex h-11 items-center rounded-full bg-brand px-5 font-display text-sm font-bold text-white transition-colors hover:bg-brand-strong disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </form>

      <div className="mt-4 rounded-2xl border border-line bg-white p-6">
        <div className="font-display text-base font-bold text-ink">Sign out</div>
        <div className="mt-1 text-sm text-muted">End your session on this device.</div>
        <button
          onClick={() => logout.mutate()}
          className="mt-4 inline-flex h-11 items-center rounded-full border border-danger px-5 font-display text-sm font-bold text-danger transition-colors hover:bg-danger hover:text-white"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Lint + build**

```bash
npm run lint && npm run build
```

Expected: builds clean.

- [ ] **Step 4: Manual check**

```bash
npm run dev
```

Printer page: shows current state (Preview by default), and in a WebUSB-capable browser the Connect button appears when disconnected. Settings page: shows avatar/name/email, saving a new name toasts "Name updated" (and the new name shows as author on future events), Sign out returns to `/login`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PrinterPage.tsx src/pages/SettingsPage.tsx
git commit -m "$(printf 'feat(shell): real Printer and Settings pages\n\nPrinter shows adapter/connection state with a Connect action;\nSettings edits the display name and signs out.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Notes for the implementer

- **`/c/...` paths** are Git Bash style for this Windows machine; adjust if your shell differs. The frontend branch `feat/dashboard-shell` already exists and holds the design+plan docs.
- **`PrinterStatus`, `UserMenu`, `useAuth` hooks, `printerStore`** are all unchanged and reused. Do not modify them.
- **`AttendeeTable` already derives its own printed/not-printed counts** from the attendees query — the kiosk needs no count props.
- **Why `printedCount` on the card may briefly lag:** the dashboard uses the cached `['events']` query; React Query refetches on window focus, so counts refresh when an operator returns from the kiosk. No extra wiring needed.
- The kiosk's `useEvents()` call shares the same cached `['events']` query the dashboard already populated, so opening a kiosk is instant (no separate per-event fetch for the name).
