# Roadshow Badge Printing — Option B (Local Print Agent) — Context Handoff

> **Purpose of this file:** This is a complete cold-start briefing for a _separate_ chat whose job is to build **Option B** of the Roadshow badge-printing system. The main chat is building **Option A** (browser WebUSB). Option B exists as the **demo-day fallback**: if Option A fails live, the team switches to the Option B machine and keeps printing. Read this top to bottom — it contains everything established so far. Where something has **not** been decided yet, it is explicitly marked as an **open question** rather than guessed.

---

## 1. The project

**Roadshow** is a community project that runs a **one-day event every month**, with roughly **100–200 attendees** per event. The user leads the **registration team**, which is responsible for printing **attendee name badges**.

The current badge workflow is heavily manual and is the problem we are solving.

### Current manual process

1. Attendees register through a **Telegram bot**.
2. Registration data lands in a **large master Excel sheet** that holds registrations across _all_ community events.
3. Before each Roadshow event, the user **manually extracts** the relevant registrations into a separate per-event spreadsheet.
4. Volunteers then manually, in Microsoft Word:
   - Copy participant names in.
   - Convert names to **UPPERCASE**.
   - **Center-align** the text.
   - Apply the correct formatting/layout.
   - Configure a **custom paper size** (~**80mm × 60mm** badge format).
5. Badges are printed one by one or in small batches.

### Problems with today's process

- Too many manual steps.
- High risk of formatting mistakes.
- Volunteers must be trained on the Word + printer setup.
- Slow during event prep.
- Doesn't scale as attendance grows.

### Desired outcome

- Registration data shows up in a dedicated app.
- Staff can **search/browse** attendees.
- Each attendee row has a **"Print Badge"** button.
- One click **prints instantly** using a fixed template.
- The system handles uppercase, alignment, badge dimensions, and printer settings automatically.
- The printer is **connected via USB** to the computer running the app.

Required badge capabilities:

- **Single badge** printing.
- **Batch** printing.
- **Mark as printed** (so the team can see who already has a badge).
- **Reprint** lost badges.

---

## 2. Confirmed facts (not assumptions)

These were explicitly confirmed by the user:

| Topic                               | Confirmed value                                                                                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Printer**                         | **Gainscha GS-2406T PLUS** — a 4-inch desktop **thermal transfer (TT)** barcode/label printer.                                                                                                            |
| **Badge size**                      | Approximately **80mm × 60mm** labels.                                                                                                                                                                     |
| **Attendees**                       | ~**100–200 per monthly event**.                                                                                                                                                                           |
| **Event OS today**                  | **Windows only** so far. They could **not find a working macOS driver** for the printer.                                                                                                                  |
| **macOS**                           | Not required, but **Mac support would be a major win** for them if achievable.                                                                                                                            |
| **Venue internet**                  | **Reliable / always online.**                                                                                                                                                                             |
| **Data feed for the first version** | **Import the per-event spreadsheet** (upload the Excel/CSV they already extract today). Keep the existing Telegram→Excel flow untouched for now; direct Telegram integration is a possible _later_ phase. |

### About the printer (important technical context)

The Gainscha GS-2406T PLUS is a **TSPL-family** label printer (TSC-compatible command language). That means instead of rendering a document and sending it through a print driver, you can send it **plain text commands** describing the label, e.g.:

```
SIZE 80 mm, 60 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
TEXT 400,250,"3",0,1,1,"JOHN SMITH"
PRINT 1
```

The printer renders the label itself. This natively gives **exact dimensions, alignment, and instant printing with no OS print dialog**. Uppercasing is just a string transform done before sending the text.

**Why this matters for OS support:** The missing macOS driver is only a blocker if you print _through the OS print system_. If you send **raw TSPL bytes directly to the USB device**, you bypass the vendor driver entirely — which is the path both Option A and Option B rely on.

> **Open question (printer):** Confirm the print **resolution / dpi** of this exact unit (commonly **203 dpi = 8 dots/mm**, but the "PLUS" variant may differ, e.g. 300 dpi). The dpi sets the dot grid, so TSPL X/Y coordinates and font sizing depend on it. Verify on real hardware before finalizing the template coordinates.

---

## 3. What Option B is, and why it exists

Two printing architectures were considered. The main chat is building **Option A**; this chat builds **Option B** as a parallel, independent fallback so the demo has a safety net.

- **Option A (built in the other chat):** A hosted web app opened in **Chrome/Edge**. The browser talks to the USB printer **directly via the WebUSB API** and sends raw TSPL. Zero install, cross-OS (Windows + macOS). Its one rough edge: on **Windows**, WebUSB requires the printer to be bound to a generic **WinUSB** driver (a one-time ~2-minute setup with a tool like Zadig) instead of Gainscha's driver.

- **Option B (built HERE):** The same kind of web UI, but printing goes through a **small local "print agent"** installed on the event laptop. The web app sends a print job to the agent on `localhost`; the agent pushes TSPL to the printer. This avoids the browser's WebUSB constraints and is the most robust path on Windows.

**Option B's role on demo day:** be ready to take over if Option A's live printing fails (e.g., a WebUSB permission/driver hiccup on the demo machine).

---

## 4. Option B — architecture to build

**Shape:** Web UI (browser) + a **local print agent** running on the same laptop as the printer.

```
[ Browser UI ]  --HTTP-->  [ Local print agent on localhost ]  --raw USB/TSPL-->  [ Gainscha printer ]
        |
        +--(optional)--> [ backend + database for attendee data / printed status ]
```

### Components

1. **Web UI** (browser): list/search attendees, "Print Badge" per row, batch print, mark-as-printed, reprint. This can and should **share most of its code with Option A** — the only real difference is _how the print job is dispatched_ (Option A → WebUSB; Option B → HTTP call to the local agent).
2. **Local print agent**: a small program installed on the event laptop. It:
   - Listens on a `localhost` port.
   - Receives a print job (the attendee name / fields, or pre-built TSPL).
   - Builds the TSPL for the 80×60mm badge (uppercase, centered).
   - Sends the raw bytes to the Gainscha over USB.
   - Returns success/failure to the UI.
3. **Data layer** (shared concept with Option A): stores the imported per-event attendees and their **print status** (not printed / printed / reprint count) so multiple volunteers see a consistent view.

### How the agent reaches the printer (decide in that chat)

Cross-platform options, to be chosen during Option B's own design:

- **Raw USB via libusb** (e.g., Node `node-usb`) — driverless, works on Windows + macOS, mirrors Option A's WebUSB byte path most closely.
- **OS raw spooling** — Windows: send a RAW job to the installed printer; macOS: `lp -o raw`. Uses the OS but still sends raw TSPL.
- Packaging the agent as a **single executable** (e.g., pkg/nexe for Node, or a Tauri sidecar) so volunteers just run one file.

### Badge template (shared with Option A)

- Fixed **80mm × 60mm** label.
- Attendee **name in UPPERCASE, centered**.
- Exact fields/layout beyond the name are an **open question** (see §6).

### Required features (same as Option A)

- **Single print:** one attendee → one badge.
- **Batch print:** select many → agent prints them in sequence.
- **Mark as printed:** status persisted and visible to the whole team.
- **Reprint:** print again on demand (e.g., lost badge); should be logged/counted.

---

## 5. User's stack preferences (from their global config — real, not assumed)

- **Frontend:** React (JSX/TSX), **Vite**, **Tailwind**. CSS/SCSS only when Tailwind can't do it cleanly. State: **Zustand** (client), **React Query** (server/async). **No tests.**
- **Backend:** **Node.js + Express + TypeScript**, **Zod** for validation. Structure: `controllers/`, `models/`, `services/`, `middlewares/`, `routes/`, `validators/`. Naming: `*.routes.ts`, `*.controllers.ts`, `*.services.ts`. Small focused functions; extract reusable bits to `utils/`.
- User is **growing into backend** — flag clearly-better idiomatic approaches briefly, recommend rather than override.
- Communication style: concise, warm, direct, practical, no jargon.

The local print agent will most naturally be a **Node + TypeScript** program (consistent with the above), but its exact form (standalone service vs. bundled exe vs. Tauri sidecar) is open.

---

## 6. Open questions to resolve in the Option B chat

These are **not yet decided** — do not assume answers:

1. **Printer dpi** (203 vs 300) — verify on hardware; affects TSPL coordinates.
2. **Badge layout beyond the name** — does the badge also need: event name/logo, role/ticket type, a number, a QR/barcode, date? What fields exist in the per-event spreadsheet?
3. **Spreadsheet schema** — exact column names/format of the per-event Excel/CSV that will be imported.
4. **Data persistence** — does Option B share one backend + database with Option A, or run its own? What database? (Attendee data is simple/tabular; both relational and document stores fit.)
5. **Agent transport to printer** — libusb (driverless) vs OS raw spooling.
6. **Agent packaging/distribution** — how volunteers install/run it; auto-start; updates.
7. **Concurrency** — multiple volunteers printing at once; how "mark as printed" stays consistent.
8. **Where the UI is hosted** — same hosted web app as Option A (calling `localhost` agent), or served locally.

---

## 7. How to start the Option B chat

Kick off with brainstorming (design before code). Suggested opening for that session:

> "We're building **Option B** of the Roadshow badge printer: a web UI plus a **local print agent** on the event laptop that sends raw **TSPL** to a **Gainscha GS-2406T PLUS** over USB. It's the demo-day fallback for Option A. Read `OptionB.md` for full context. Let's settle the open questions in §6, starting with the badge layout and the spreadsheet schema, then design the agent."

**Reminder:** Option A and Option B should share the web UI and the TSPL badge-building logic as much as possible — the difference is only the dispatch mechanism (WebUSB vs local agent). Keep that boundary clean so both can coexist on demo day.
