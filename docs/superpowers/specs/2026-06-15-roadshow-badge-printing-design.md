# Roadshow Badge Printing — Option A (Web + WebUSB) — Design Spec

**Date:** 2026-06-15
**Status:** Approved for MVP build (hardware-deferred)
**Related:** `OptionB.md` (the local-print-agent fallback, built in a separate chat)

---

## 1. Problem

The Roadshow registration team prints name badges for a monthly event of ~100–200 attendees. Today the flow is manual: extract a per-event spreadsheet from a master Excel, then in Word copy each name, uppercase it, center it, set an ~80×60mm paper size, and print. It is slow, error-prone, hard to train, and doesn't scale.

**Goal:** a web app where staff browse/search attendees and click **Print Badge** to instantly print a correctly formatted 80×60mm badge, with shared "already printed" tracking and easy reprints.

## 2. Confirmed facts

- **Printer:** Gainscha GS-2406T PLUS — 4-inch desktop thermal-transfer label printer, **TSPL** command language. (Not on hand yet — see §9.)
- **Badge:** ~**80mm × 60mm**. **Name only**, centered, uppercase.
- **Volume:** ~100–200 attendees/month.
- **OS:** Windows today; **macOS support is highly desired** (no Mac driver exists — driverless USB solves this).
- **Internet at venue:** reliable / always online.
- **Data feed (v1):** import the per-event Excel/CSV the user already extracts. Telegram direct integration is a later phase.
- **Spreadsheet:** name column + a few extra fields (e.g. phone/email/role/reg-id) used for **search only**, not on the badge.
- **Printed status:** **shared across the whole team in real time** (backend + database).

## 3. Why this architecture

Printing raw **TSPL** to the printer gives exact dimensions, centering, uppercase, and instant output with **no OS print dialog** — and, sent over **raw USB**, it bypasses the missing macOS driver entirely. A hosted web app over HTTPS can do this directly from Chrome/Edge via **WebUSB**, with zero install and one codebase across Windows + macOS.

The backend owns **data only**; the browser owns the **printer connection**. This split keeps the UI reusable by Option B (which swaps only the dispatch layer).

## 4. Architecture

```
[ React UI (Chrome/Edge) ] --HTTPS--> [ Express API ] --> [ Postgres ]
            |
            +-- WebUSB (raw TSPL bulk transfer) --> [ Gainscha printer ]
```

- **React UI:** import, browse/search, connect printer, print (single/batch), reprint, status.
- **Express API + Postgres:** attendees and print status; shared, consistent across volunteers.
- **Printing:** in-browser, never via the backend.

## 5. Printing layer (hardware-deferred)

Printing sits behind one interface so the app is fully buildable and demoable **without the printer**:

```ts
interface PrinterAdapter {
  connect(): Promise<void>;
  print(tspl: string): Promise<void>;
  status: 'disconnected' | 'connected';
}
```

Two implementations:

1. **`PreviewPrinter` (default now):** renders the badge as an on-screen **80×60mm preview** and lets the user **download/inspect the raw TSPL**. Exercises every flow (single, batch, reprint, status) with no hardware.
2. **`WebUsbPrinter` (written now, activated later):** `navigator.usb.requestDevice()` with a Gainscha VID/PID filter (one-time permission, persists), then sends the TSPL via a **bulk OUT transfer**. Verified when hardware arrives (§9).

Adapter is selected by a config/dev toggle; default **Preview** until the printer is on hand.

### TSPL builder

A pure util `buildBadgeTSPL(name: string): string` emits, roughly:

```
SIZE 80 mm, 60 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
TEXT <x>,<y>,"<font>",0,<mul>,<mul>,"<NAME UPPERCASED>"
PRINT 1
```

Centering coordinates depend on printer **dpi (203 vs 300)** — a single constant to confirm on hardware. This util is isolated and shared with Option B.

## 6. Data model (MongoDB)

Two collections:

- **events:** `{ _id, name, date, createdAt }`
- **attendees:** `{ _id, eventId, fullName (→ badge), extra (object of remaining columns, searchable), printStatus ('not_printed' | 'printed'), printCount (default 0), lastPrintedAt (nullable) }`

Indexes: `attendees.eventId`, plus a text index (or simple regex search) on `fullName` and `extra` values for browse/search.

**Concurrency:** print actions use atomic `findOneAndUpdate` with `$inc` on `printCount` and `$set` on status, so simultaneous volunteers can't corrupt counts and everyone sees consistent status (React Query invalidation on success).

No authentication in v1 (one trusted team, shared app).

## 7. Flows

- **Import:** upload Excel/CSV → parse (SheetJS) → **column-map step** (choose the name column; rest stored in `extra`) → create event + attendees.
- **Browse/search:** list attendees for the selected event; search by name/extra fields; filter by printed / not-printed.
- **Connect printer:** "Connect printer" button → WebUSB device pick (or Preview mode if no hardware); connection status in header.
- **Single print:** click row → `buildBadgeTSPL` → adapter `print()` → on success: `print_status = printed`, `print_count++`, `last_printed_at = now`.
- **Batch print:** select rows or "print all unprinted" → send sequentially → mark each on success.
- **Reprint:** explicit button on a printed row → send again → `print_count++` (status stays printed). For lost badges.

## 8. Stack & repo layout

- **Frontend** (`/frontend`): React + Vite + TypeScript + Tailwind. **Zustand** for printer-connection/UI state, **React Query** for server data. SheetJS for spreadsheet parsing.
- **Backend** (`/backend`): Node + Express + TypeScript, **Zod** validation, structured `controllers/`, `services/`, `routes/`, `validators/`, `models/`, `utils/`.
- **DB:** **MongoDB** (via Mongoose — models map cleanly to the `models/` folder).
- **Deploy:** web app + API + DB hosted (provides the HTTPS that WebUSB requires). Works on `localhost` for dev (also a secure context).

Repo layout (frontend and backend are worked on separately; specs/plans live at root, never inside `frontend/` or `backend/`):

```
/ (root)
├── frontend/          # React + Vite app
├── backend/           # Express + TS API
├── docs/superpowers/specs/   # this spec + future plans
└── OptionB.md         # local-print-agent fallback briefing
```

## 9. Deferred hardware spike (do when printer arrives)

Before relying on real printing, confirm on the Gainscha:

1. USB **vendor/product ID** (for the WebUSB filter).
2. Raw **TSPL prints correctly** over a WebUSB **bulk OUT** transfer.
3. Correct **dpi** (203 vs 300) → finalize TSPL centering constants.
4. **Windows WinUSB** one-time binding (Zadig) so WebUSB can claim the device.

If that prints one good badge, flip the adapter from Preview to WebUSB — no other app changes.

## 10. MVP scope (next event)

**In:** import one event → browse/search → connect (Preview now, WebUSB-ready) → single + batch print → mark printed → reprint → shared status via Postgres.

**Out (later phases):** direct Telegram integration, user accounts, badge fields beyond the name, analytics/reporting, multi-event management beyond basics.

## 11. Open items

- Exact spreadsheet column headers (resolved at import via the column-map step; user can paste real headers to pre-map).
- Printer dpi + VID/PID (resolved in §9 hardware spike).
- Final hosting target for deployment.
