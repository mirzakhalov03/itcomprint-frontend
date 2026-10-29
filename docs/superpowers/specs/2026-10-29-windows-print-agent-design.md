# Windows Print Agent — Design

**Date:** 2026-10-29
**Status:** Approved in conversation, awaiting written-spec review

## Goal

Any team laptop running Windows can print badges to the Gainscha GS-2406T PLUS **whether or not the Gainscha driver is installed**, after one install and nothing else to do. macOS keeps printing over WebUSB exactly as today (proven on hardware).

## Why not WebUSB on Windows

WebUSB can only claim a USB interface no Windows driver owns. On Windows a printer is always owned: by the Gainscha driver if installed, otherwise by Windows' built-in _USB Printing Support_ (`usbprint.sys`). `claimInterface` fails in both cases. The only WebUSB fix is rebinding the device to WinUSB with Zadig (admin rights, per laptop, and it breaks every other app's access to the printer), so it is ruled out.

## Decisions

| Decision        | Choice                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Approach        | Local print agent on `127.0.0.1`, called by the hosted web app                                            |
| Agent language  | Go (single small `.exe`, no runtime, direct Win32 calls)                                                  |
| Distribution    | Per-user installer (no admin) + self-update from GitHub Releases                                          |
| Code + releases | `itcomprint-frontend/agent/`, releases tagged `agent-vX.Y.Z` (repo is public, so downloads need no token) |
| Badge logic     | Stays in the browser. The agent only relays bytes                                                         |
| Platforms       | Agent is Windows-only. Mac/Linux keep WebUSB                                                              |

## Architecture

```
Browser (kiosk)                         Windows laptop
───────────────                         ──────────────────────────────────────
renderBadge → buildBadgeTSPL            ITCOM Print Agent (Go, tray icon)
        │   (unchanged)                   HTTP on 127.0.0.1:17171
        ▼                                        │
AgentPrinter ──POST /print (raw TSPL)──▶         ├─ queue: driver installed → spooler, RAW datatype
                                                 └─ usb:   no queue → write to the usbprint device directly
```

---

## Part 1 — The agent (`itcomprint-frontend/agent/`)

### Layout

```
agent/
  go.mod
  main.go              // wiring: single-instance, config, server, tray, updater
  server.go            // HTTP API + origin checks
  printers/
    printers.go        // Printer type, Discover(), Write(); dedup + auto-select rules
    queue_windows.go   // spooler enumeration + RAW write
    usb_windows.go     // usbprint device enumeration + direct write
  config.go            // load/save selected printer
  updater.go           // GitHub Releases check, verify, swap, restart
  tray.go              // tray icon + menu
  installer/agent.iss  // Inno Setup script
```

Dependencies: Go stdlib (`net/http`), `golang.org/x/sys/windows`, `fyne.io/systray` (no cgo on Windows). Nothing else.

### Process

- **Single instance:** a named mutex (`Local\ITCOMPrintAgent`). A second launch exits silently.
- **Listens on `127.0.0.1:17171` only**, never on the network. If the port is taken, the tray shows "Port 17171 in use" and the log records it.
- Built with `-H windowsgui` (no console window). `version` and `allowedOrigins` are injected at build time via `-ldflags -X`.

### HTTP API

All responses are JSON except `POST /print`'s request body. Errors are `{ "error": "<human-readable message>" }`.

| Method & path  | Request                                              | Success                                                                                                        | Errors                                                                                                           |
| -------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /status`  | —                                                    | `200 { version, hostname, printers: [{ id, name, transport: "queue" \| "usb" }], selectedId: string \| null }` | —                                                                                                                |
| `PUT /printer` | `{ "id": string }`                                   | `200` same body as `/status`                                                                                   | `404` unknown id                                                                                                 |
| `POST /print`  | `application/octet-stream`, raw TSPL bytes, max 4 MB | `204`                                                                                                          | `409` no printer selected · `413` too large · `502` write to printer failed (message includes the Windows error) |

`printers` is re-discovered on every `/status` call (cheap: two Win32 enumerations), so plugging the printer in shows up on the app's next poll.

### Origin security

Without this, any website open in the browser could print to the laptop.

- Every request must carry an `Origin` header in `allowedOrigins`. Anything else → `403`.
- `allowedOrigins` = build-time value from the GitHub Actions repo variable `AGENT_ALLOWED_ORIGINS` (comma-separated, e.g. the production frontend URL), always plus `http://localhost:5173` for dev. The production URL is never hard-coded in source.
- CORS: echo the allowed `Origin` in `Access-Control-Allow-Origin` and add `Vary: Origin`. Answer `OPTIONS` preflights with the allowed methods/headers and `Access-Control-Allow-Private-Network: true`, so Chrome/Edge's local-network permission check passes (the browser asks the user to allow it once per site).
- An HTTPS page may call `http://127.0.0.1`: Chrome and Edge treat loopback as secure, so there's no mixed-content block.

### Printer discovery

Discovery starts from **physical USB printers that are plugged in right now**, so Windows' virtual printers (Microsoft Print to PDF, XPS, Fax) never appear, and a queue whose printer is unplugged disappears instead of looking ready.

1. **Present USB printers** — `SetupDiGetClassDevsW` on `GUID_DEVINTERFACE_USBPRINT` `{28d78fad-5a12-11d1-ae5b-0000f803a8c2}` with `DIGCF_PRESENT | DIGCF_DEVICEINTERFACE`. For each: the device path, its port name (`Base Name` + 3-digit `Port Number` from the interface's registry key, e.g. `USB001`), and a description (bus-reported device description, fallback device description, fallback `"USB printer"`).
2. **Queues** — `EnumPrintersW(PRINTER_ENUM_LOCAL, level 5)` gives each queue's name and port list (comma-separated).
3. **Per device:** every queue using that device's port becomes `{ id: "queue:" + queueName, name: queueName, transport: "queue" }`. A device with no queue becomes `{ id: "usb:" + devicePath, name: description, transport: "usb" }`. A device that has a driver is reached through the spooler; one without a driver is written to directly.

**RAW fallback:** if a queue's driver rejects the `RAW` datatype (`ERROR_INVALID_DATATYPE`), that print falls back to a direct write to the same device and logs it.

### Selection

Stored in `%APPDATA%\ITCOM Print Agent\config.json` as `{ "selectedId": "..." }`.

When there is no saved id, or the saved id isn't in the current list, try auto-selection:

1. Exactly one printer → select it.
2. Otherwise, exactly one whose name contains `gainscha` or `gprinter` (case-insensitive) → select it.

If auto-selection picks one, it is saved to config like a manual choice (this covers a printer being swapped for another). If it picks none, the saved id is **kept**. An unplugged printer then shows as "printer not found" and comes back on its own when plugged in, and with several printers and nothing saved, `selectedId` is `null` and the app shows a picker.

### Writing

One print at a time (a mutex around `Write`); concurrent requests queue behind it.

- **queue:** `OpenPrinterW` → `StartDocPrinterW` (`DOC_INFO_1`, datatype `"RAW"`, doc name `"ITCOM badge"`) → `StartPagePrinter` → `WritePrinter` (loop until all bytes written) → `EndPagePrinter` → `EndDocPrinter` → `ClosePrinter`.
- **usb:** `CreateFileW(devicePath, GENERIC_WRITE, FILE_SHARE_READ|FILE_SHARE_WRITE, OPEN_EXISTING)` → `WriteFile` loop → `CloseHandle`. A 15 s timeout guards a wedged device; a timeout → `502`.

### Tray

Icon + menu:

- Status line (disabled item): `Ready — <printer name>` / `No printer found` / `Choose a printer in the app`
- `Version x.y.z`
- `Open log`: opens `%LOCALAPPDATA%\ITCOM Print Agent\agent.log` (rotated at 1 MB, one backup)
- `Quit`

### Logging

Startup, printer list changes, every print (printer id, byte count, duration, result), update checks and results, all errors. No badge content.

---

## Part 2 — Install and auto-update

### Installer (`agent/installer/agent.iss`, Inno Setup)

- `PrivilegesRequired=lowest`: no admin prompt.
- Installs `itcomprint-agent.exe` to `{localappdata}\Programs\ITCOM Print Agent`.
- Adds `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\ITCOMPrintAgent` → starts on login.
- Launches the agent at the end of setup.
- Uninstaller stops the agent, removes the Run value and the install folder (config and log are left alone).
- Unsigned. SmartScreen shows "unrecognized app" on first run: _More info → Run anyway_, once per laptop. Code signing is out of scope.

### Self-update (`updater.go`)

- Runs 30 s after startup, then every 6 h.
- `GET https://api.github.com/repos/mirzakhalov03/itcomprint-frontend/releases?per_page=30`. Picks the highest semver among non-draft, non-prerelease releases whose tag matches `agent-v*`.
- If newer than `version`: download the release assets `itcomprint-agent.exe` and `checksums.txt`, then verify SHA-256. A mismatch → discard and log.
- Swap: wait for the print mutex → rename running exe to `itcomprint-agent.exe.old` → move the download into place → start the new exe → exit. The new process deletes any `.old` on startup.
- Any network or GitHub error → log and keep running. Updates never block printing.

### Release pipeline (`.github/workflows/agent-release.yml`)

- Trigger: push of a tag matching `agent-v*`.
- Runs on `windows-latest`: `go build` with `GOOS=windows`, `-ldflags "-H windowsgui -X main.version=<tag without agent-v> -X main.allowedOrigins=${{ vars.AGENT_ALLOWED_ORIGINS }}"`. Then build the installer with Inno Setup (`choco install innosetup`) and generate `checksums.txt`.
- Creates the GitHub Release for the tag with three assets: `itcomprint-agent.exe`, `ITCOM-Print-Agent-Setup.exe`, `checksums.txt`.

**Repo constraint:** the app's install link uses `releases/latest/download/ITCOM-Print-Agent-Setup.exe`, so agent releases must remain the only GitHub Releases in `itcomprint-frontend`. If frontend releases are ever added, switch the link to a pinned tag URL.

### Setting up a new laptop

1. Open the app's Printer page → **Download print agent**.
2. Run the installer (SmartScreen: _More info → Run anyway_).
3. Allow local network access when Chrome/Edge asks.
4. **Print test label**.

---

## Part 3 — Frontend changes

### Runtime printer selection

`createPrinter` becomes `detectPrinter(): Promise<PrinterAdapter>`, run when the printer store initialises and again on demand:

1. `VITE_PRINTER_MODE === 'preview'` → `PreviewPrinter` (dev override, kept)
2. `GET {VITE_AGENT_URL}/status` answers within 1 s → `AgentPrinter`
3. `'usb' in navigator` and not Windows → `WebUsbPrinter` (unchanged)
4. Windows → `AgentMissingPrinter`
5. Otherwise → `PreviewPrinter`

`VITE_AGENT_URL` defaults to `http://127.0.0.1:17171`. Windows detection: `navigator.userAgentData?.platform === 'Windows'`, falling back to `/Windows/.test(navigator.userAgent)`. The `VITE_PRINTER_MODE=webusb` value goes away; the README is updated accordingly.

### Store (`src/store/printerStore.ts`)

- `adapter` moves into Zustand state instead of a module constant, and `status` gains `'detecting'` for the moment before the first detection resolves.
- New `redetect()` action: re-runs `detectPrinter()`, swaps the adapter, and stops the old adapter's polling.
- `connect` / `disconnect` / `connectPrinterWithToast` / activity reporting keep their current shape.

### Adapters

`PrinterAdapter.kind` becomes `'preview' | 'webusb' | 'agent' | 'agent-missing'`.

**`AgentPrinter`** (`src/printer/AgentPrinter.ts`) + **`agentClient`** (`src/printer/agentClient.ts`: typed `getStatus` / `selectPrinter` / `print` fetch wrappers with timeouts, mapping the agent's `{ error }` bodies into `Error` messages):

- `status = 'connected'` iff the agent is reachable and `selectedId` is in `printers`.
- `connect()` = fetch `/status` and update. No device popup.
- `print(job)` = `POST /print` with `job.tspl`.
- While it's the active adapter it polls `/status` every 10 s and pushes changes to the store. Transitions connected ↔ disconnected are reported to the activity log via the existing `reportPrinter`. If the agent becomes unreachable, the store calls `redetect()`.
- Exposes the latest status (`version`, `hostname`, `printers`, `selectedId`, transport of the selected printer) for the Printer page.

**`AgentMissingPrinter`** (`src/printer/AgentMissingPrinter.ts`): `status = 'disconnected'`, `print()` throws `"Install the ITCOM print agent to print on Windows."`, `connect()` triggers `redetect()` (so the button means "Check again").

### Presentation (`usePrinterPresentation` + its two consumers)

| Adapter             | Header pill                     | Action button                   |
| ------------------- | ------------------------------- | ------------------------------- |
| preview             | "Preview mode" (as today)       | —                               |
| webusb              | as today                        | Connect / Disconnect (as today) |
| agent, connected    | "Printer connected"             | —                               |
| agent, disconnected | "Printer not found"             | — (polling recovers on its own) |
| agent-missing       | "Set up printing" (red outline) | **Check again**                 |
| detecting           | neutral "Checking printer…"     | —                               |

### Printer page (`src/pages/PrinterPage.tsx`)

- **agent:** status, transport label ("Windows print queue" / "Direct USB"), agent version. A printer `<select>` shown only when `printers.length > 1` or `selectedId` is null; it calls `PUT /printer`. A **Print test label** button.
- **agent-missing:** a short explanation, a **Download print agent** button (`https://github.com/mirzakhalov03/itcomprint-frontend/releases/latest/download/ITCOM-Print-Agent-Setup.exe`), the three setup steps, and **Check again**.
- **Agent too old:** a new constant `MIN_AGENT_VERSION` in `AgentPrinter.ts`. If `status.version` is below it, the page shows an "Update agent" notice with the same download link, and the header pill shows "Update print agent". The agent's own updater normally makes this a non-event; the notice covers laptops that were offline for a long time.

### Test label

The Printer page builds a synthetic one-zone template ("ITCOM test · {hostname} · {date}") at the default badge template's label size (fallback 80×60 mm), and runs it through the **existing** `renderBadgeToCanvas → canvasToMonochromeBitmap → buildBadgeTSPL` pipeline. No separate TSPL path, so the test proves the real path.

### Small fixes

- `usePrintAttendee.ts:70`: "Sent to printer" toast fires for any non-preview adapter, not only `webusb`.
- `docs/CLAUDE.md` and `README.md`: describe runtime detection and the agent, remove the "hardware spike has never been run" / "not yet tested on hardware" notes (Mac + WebUSB is verified), and document `VITE_AGENT_URL`.

---

## Error handling summary

| Situation                                    | What the user sees                                                                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows, agent not installed or not running  | "Set up printing" pill; Printer page with download + Check again                                                                                                      |
| Agent running, printer unplugged             | "Printer not found" within ~10 s; recovers by itself when plugged back in                                                                                             |
| Agent running, several printers, none chosen | Printer page shows the picker; pill shows "Printer not found"                                                                                                         |
| Print write fails (paper out, device wedged) | Existing print-error toast with the agent's message; the attendee is **not** marked printed (current behaviour, since `api.printAttendee` runs after `adapter.print`) |
| Chrome local-network permission denied       | Detection fails → "Set up printing" state. The setup steps include allowing it                                                                                        |
| Agent update fails                           | Nothing visible; logged. Old version keeps working                                                                                                                    |

## Verification (manual, on hardware)

1. Windows laptop **with** the Gainscha driver: install → test label prints via "Windows print queue".
2. Windows laptop **without** the driver (uninstall it): test label prints via "Direct USB".
3. Unplug / replug the printer: pill goes red, then green, without a page reload.
4. Quit the agent from the tray: app falls to "Set up printing"; restart the agent → Check again → connected.
5. Tag `agent-v0.1.1` after installing `0.1.0`: laptop self-updates (restart the agent to trigger it immediately) and the tray shows the new version.
6. Mac: WebUSB flow unchanged.
7. From an origin not in the allowlist, `fetch('http://127.0.0.1:17171/status')` → 403.

## Out of scope

- Mac/Linux agent (WebUSB already works there)
- Code signing
- Several printers on one laptop at the same time / per-station routing
- Moving badge rendering into the agent
