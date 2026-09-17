# Roadshow Badge Printing — Frontend Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note on tests:** Per the project owner's standing preference there is **no automated test suite**. Verification is **manual** — run the dev server and click through, with the expected on-screen behavior described in each task.

**Goal:** A Chrome/Edge web app where staff import an event spreadsheet, browse/search attendees, and click **Print Badge** (single or batch) to print an 80×60mm uppercase-name badge — with shared printed-status and reprints. Printing runs through a swappable adapter so the app is fully usable on a **PreviewPrinter** today and flips to **WebUSB** when the Gainscha printer arrives.

**Architecture:** React + Vite SPA. React Query owns server data (events/attendees); Zustand owns the live printer connection. A `PrinterAdapter` interface has two implementations — `PreviewPrinter` (renders an on-screen 80×60mm badge + downloadable TSPL) and `WebUsbPrinter` (sends raw TSPL over a USB bulk transfer). Spreadsheet parsing + column mapping happen client-side with SheetJS; the API receives clean JSON.

**Tech Stack:** React, Vite, TypeScript, Tailwind, Zustand, @tanstack/react-query, xlsx (SheetJS), WebUSB.

**Spec:** `docs/superpowers/specs/2026-06-15-roadshow-badge-printing-design.md`
**Backend contract:** see "Shared JSON shapes" in `docs/superpowers/plans/2026-06-15-backend-implementation.md`.

---

## File structure

```
frontend/
├── .env                                # VITE_API_URL, VITE_PRINTER_MODE
├── tailwind.config.js / index.css      # Tailwind setup
└── src/
    ├── main.tsx                        # providers (React Query)
    ├── App.tsx                         # layout + page
    ├── types.ts                        # Event, Attendee, PrintJob
    ├── lib/
    │   ├── api.ts                      # fetch wrapper + endpoint fns
    │   └── queryClient.ts
    ├── printer/
    │   ├── PrinterAdapter.ts           # interface + PrintJob
    │   ├── buildBadgeTSPL.ts           # name -> TSPL string
    │   ├── PreviewPrinter.ts           # no-hardware adapter
    │   ├── WebUsbPrinter.ts            # real USB adapter
    │   └── createPrinter.ts            # factory from env toggle
    ├── store/
    │   ├── printerStore.ts             # adapter instance + connection status
    │   └── previewStore.ts             # badges shown by PreviewPrinter
    ├── hooks/
    │   ├── useEvents.ts
    │   ├── useAttendees.ts
    │   └── usePrintAttendee.ts
    └── components/
        ├── PrinterStatus.tsx           # connect button + status pill
        ├── ImportDialog.tsx            # upload + SheetJS + column map
        ├── EventSelector.tsx
        ├── AttendeeTable.tsx           # search/filter + rows + batch
        ├── AttendeeRow.tsx
        └── BadgePreviewTray.tsx        # renders PreviewPrinter output
```

---

### Task 0: Scaffold the Vite app + Tailwind + deps

**Files:** Create the `frontend/` app.

- [ ] **Step 1: Scaffold Vite (React + TS) into the existing folder**

```bash
cd /Users/mn.afridi/Desktop/ItComPrint
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Step 2: Install runtime deps**

```bash
npm install @tanstack/react-query zustand xlsx
npm install -D tailwindcss @tailwindcss/postcss postcss autoprefixer
```

- [ ] **Step 3: Configure Tailwind v4 — create `frontend/postcss.config.js`**

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Replace `frontend/src/index.css`**

```css
@import 'tailwindcss';
```

- [ ] **Step 5: Create `frontend/.env`**

```
VITE_API_URL=http://localhost:4000/api
VITE_PRINTER_MODE=preview
```

- [ ] **Step 6: Verify the dev server boots**

Run: `npm run dev`
Expected: Vite serves on `http://localhost:5173` and the default page renders with Tailwind active (no PostCSS errors in the terminal).

- [ ] **Step 7: Commit**

```bash
cd /Users/mn.afridi/Desktop/ItComPrint
git add frontend
git commit -m "chore(frontend): scaffold Vite React TS + Tailwind"
```

---

### Task 1: Types, API client, React Query provider

**Files:**

- Create: `frontend/src/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/queryClient.ts`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Write `frontend/src/types.ts`** (mirrors the backend JSON shapes)

```ts
export interface AppEvent {
  _id: string;
  name: string;
  date: string;
  createdAt: string;
  attendeeCount?: number;
}

export type PrintStatus = 'not_printed' | 'printed';

export interface Attendee {
  _id: string;
  eventId: string;
  fullName: string;
  extra: Record<string, string>;
  printStatus: PrintStatus;
  printCount: number;
  lastPrintedAt: string | null;
}

export interface NewAttendee {
  fullName: string;
  extra: Record<string, string>;
}
```

- [ ] **Step 2: Write `frontend/src/lib/api.ts`**

```ts
import type { AppEvent, Attendee, NewAttendee } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listEvents: () => request<AppEvent[]>('/events'),

  createEvent: (payload: { name: string; date: string; attendees: NewAttendee[] }) =>
    request<AppEvent>('/events', { method: 'POST', body: JSON.stringify(payload) }),

  listAttendees: (eventId: string, params: { search?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.status) qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<Attendee[]>(`/events/${eventId}/attendees${suffix}`);
  },

  printAttendee: (attendeeId: string) =>
    request<Attendee>(`/attendees/${attendeeId}/print`, { method: 'POST' }),
};
```

- [ ] **Step 3: Write `frontend/src/lib/queryClient.ts`**

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});
```

- [ ] **Step 4: Replace `frontend/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): types, API client, React Query provider"
```

---

### Task 2: Printer layer (interface, TSPL builder, adapters, factory)

**Files:**

- Create: `frontend/src/printer/PrinterAdapter.ts`, `buildBadgeTSPL.ts`, `PreviewPrinter.ts`, `WebUsbPrinter.ts`, `createPrinter.ts`

- [ ] **Step 1: Write `frontend/src/printer/PrinterAdapter.ts`**

```ts
export interface PrintJob {
  name: string; // for the on-screen preview
  tspl: string; // raw bytes sent to the printer
}

export type PrinterStatus = 'disconnected' | 'connected';

export interface PrinterAdapter {
  readonly kind: 'preview' | 'webusb';
  status: PrinterStatus;
  connect(): Promise<void>;
  print(job: PrintJob): Promise<void>;
}
```

- [ ] **Step 2: Write `frontend/src/printer/buildBadgeTSPL.ts`**

Uses TSPL `BLOCK`, which supports horizontal centering (`align=2`) across a width — so no manual centering math beyond the label width in dots. `DEFAULT_DPI` is the one value to confirm on real hardware (§9 of the spec).

```ts
const DEFAULT_DPI = 203; // confirm on the Gainscha; 'PLUS' units may be 300

const LABEL_WIDTH_MM = 80;
const LABEL_HEIGHT_MM = 60;

export function buildBadgeTSPL(name: string, dpi: number = DEFAULT_DPI): string {
  const dotsPerMm = dpi / 25.4;
  const widthDots = Math.round(LABEL_WIDTH_MM * dotsPerMm);
  const text = name.toUpperCase().replace(/"/g, "'"); // TSPL strings are double-quoted
  const yTop = Math.round(LABEL_HEIGHT_MM * dotsPerMm * 0.35);
  const blockHeight = Math.round(LABEL_HEIGHT_MM * dotsPerMm * 0.4);

  return [
    `SIZE ${LABEL_WIDTH_MM} mm, ${LABEL_HEIGHT_MM} mm`,
    'GAP 2 mm, 0 mm',
    'DIRECTION 1',
    'CLS',
    // BLOCK x,y,width,height,"font",rotation,x-mul,y-mul,space,align,"content"
    `BLOCK 0,${yTop},${widthDots},${blockHeight},"3",0,2,2,0,2,"${text}"`,
    'PRINT 1',
    '',
  ].join('\n');
}
```

- [ ] **Step 3: Write `frontend/src/printer/PreviewPrinter.ts`**

Pushes each job to a callback (wired to the preview store). Always "connected" — no hardware needed.

```ts
import type { PrinterAdapter, PrintJob, PrinterStatus } from './PrinterAdapter';

export class PreviewPrinter implements PrinterAdapter {
  readonly kind = 'preview' as const;
  status: PrinterStatus = 'connected';

  constructor(private readonly onPreview: (job: PrintJob) => void) {}

  async connect(): Promise<void> {
    this.status = 'connected';
  }

  async print(job: PrintJob): Promise<void> {
    this.onPreview(job);
  }
}
```

- [ ] **Step 4: Write `frontend/src/printer/WebUsbPrinter.ts`**

Generic: lets the user pick the device, then auto-detects the bulk OUT endpoint (so no hardcoded vendor/product/endpoint IDs are needed before the hardware spike).

```ts
import type { PrinterAdapter, PrintJob, PrinterStatus } from './PrinterAdapter';

export class WebUsbPrinter implements PrinterAdapter {
  readonly kind = 'webusb' as const;
  status: PrinterStatus = 'disconnected';
  private device: USBDevice | null = null;
  private endpointNumber = 1;

  async connect(): Promise<void> {
    if (!('usb' in navigator)) {
      throw new Error('WebUSB is not supported in this browser. Use Chrome or Edge.');
    }
    const device = await navigator.usb.requestDevice({ filters: [] });
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);

    const iface = device.configuration!.interfaces.find((i) =>
      i.alternate.endpoints.some((e) => e.direction === 'out' && e.type === 'bulk'),
    );
    if (!iface) throw new Error('No bulk OUT endpoint found on this device.');

    await device.claimInterface(iface.interfaceNumber);
    const ep = iface.alternate.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')!;
    this.endpointNumber = ep.endpointNumber;
    this.device = device;
    this.status = 'connected';
  }

  async print(job: PrintJob): Promise<void> {
    if (!this.device) throw new Error('Printer not connected.');
    const data = new TextEncoder().encode(job.tspl);
    await this.device.transferOut(this.endpointNumber, data);
  }
}
```

- [ ] **Step 5: Write `frontend/src/printer/createPrinter.ts`**

```ts
import type { PrinterAdapter, PrintJob } from './PrinterAdapter';
import { PreviewPrinter } from './PreviewPrinter';
import { WebUsbPrinter } from './WebUsbPrinter';

export function createPrinter(onPreview: (job: PrintJob) => void): PrinterAdapter {
  const mode = import.meta.env.VITE_PRINTER_MODE ?? 'preview';
  return mode === 'webusb' ? new WebUsbPrinter() : new PreviewPrinter(onPreview);
}
```

- [ ] **Step 6: Add WebUSB types — install**

```bash
cd frontend && npm install -D @types/w3c-web-usb
```

Then add to `frontend/tsconfig.app.json` under `compilerOptions.types`: `["w3c-web-usb"]` (create the `types` array if absent).

- [ ] **Step 7: Commit**

```bash
git add frontend
git commit -m "feat(frontend): printer adapter layer with preview + webusb"
```

---

### Task 3: Stores (preview + printer connection) and PrinterStatus

**Files:**

- Create: `frontend/src/store/previewStore.ts`, `frontend/src/store/printerStore.ts`, `frontend/src/components/PrinterStatus.tsx`

- [ ] **Step 1: Write `frontend/src/store/previewStore.ts`**

```ts
import { create } from 'zustand';
import type { PrintJob } from '../printer/PrinterAdapter';

interface PreviewState {
  jobs: PrintJob[];
  add: (job: PrintJob) => void;
  clear: () => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  jobs: [],
  add: (job) => set((s) => ({ jobs: [job, ...s.jobs] })),
  clear: () => set({ jobs: [] }),
}));
```

- [ ] **Step 2: Write `frontend/src/store/printerStore.ts`**

The adapter is created once, wired to the preview store's `add`.

```ts
import { create } from 'zustand';
import type { PrinterAdapter, PrinterStatus } from '../printer/PrinterAdapter';
import { createPrinter } from '../printer/createPrinter';
import { usePreviewStore } from './previewStore';

interface PrinterState {
  adapter: PrinterAdapter;
  status: PrinterStatus;
  error: string | null;
  connect: () => Promise<void>;
}

const adapter = createPrinter((job) => usePreviewStore.getState().add(job));

export const usePrinterStore = create<PrinterState>((set) => ({
  adapter,
  status: adapter.status,
  error: null,
  connect: async () => {
    try {
      await adapter.connect();
      set({ status: adapter.status, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to connect' });
    }
  },
}));
```

- [ ] **Step 3: Write `frontend/src/components/PrinterStatus.tsx`**

```tsx
import { usePrinterStore } from '../store/printerStore';

export function PrinterStatus() {
  const { adapter, status, error, connect } = usePrinterStore();
  const connected = status === 'connected';

  return (
    <div className="flex items-center gap-3">
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
          connected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
        {adapter.kind === 'preview'
          ? 'Preview mode'
          : connected
            ? 'Printer connected'
            : 'Printer not connected'}
      </span>
      {adapter.kind === 'webusb' && !connected && (
        <button
          onClick={() => connect()}
          className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
        >
          Connect printer
        </button>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): preview + printer stores and status component"
```

---

### Task 4: React Query hooks

**Files:**

- Create: `frontend/src/hooks/useEvents.ts`, `useAttendees.ts`, `usePrintAttendee.ts`

- [ ] **Step 1: Write `frontend/src/hooks/useEvents.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { NewAttendee } from '../types';

export function useEvents() {
  return useQuery({ queryKey: ['events'], queryFn: api.listEvents });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; date: string; attendees: NewAttendee[] }) =>
      api.createEvent(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}
```

- [ ] **Step 2: Write `frontend/src/hooks/useAttendees.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useAttendees(eventId: string | null, search: string, status: string) {
  return useQuery({
    queryKey: ['attendees', eventId, search, status],
    queryFn: () => api.listAttendees(eventId!, { search, status }),
    enabled: !!eventId,
  });
}
```

- [ ] **Step 3: Write `frontend/src/hooks/usePrintAttendee.ts`**

Combines the hardware action (adapter) with the data action (API). Marks printed only after a successful send, then invalidates the list so everyone's status updates.

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { buildBadgeTSPL } from '../printer/buildBadgeTSPL';
import { usePrinterStore } from '../store/printerStore';
import type { Attendee } from '../types';

export function usePrintAttendee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attendee: Attendee) => {
      const adapter = usePrinterStore.getState().adapter;
      if (adapter.status !== 'connected') {
        throw new Error('Printer not connected. Click "Connect printer" first.');
      }
      await adapter.print({ name: attendee.fullName, tspl: buildBadgeTSPL(attendee.fullName) });
      return api.printAttendee(attendee._id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendees'] }),
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks
git commit -m "feat(frontend): React Query hooks for events, attendees, print"
```

---

### Task 5: Import dialog (SheetJS parse + column mapping)

**Files:**

- Create: `frontend/src/components/ImportDialog.tsx`

- [ ] **Step 1: Write `frontend/src/components/ImportDialog.tsx`**

Reads the workbook, shows detected columns, lets the user pick which column is the name and name the event, then POSTs clean JSON. Remaining columns become each attendee's `extra`.

```tsx
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useCreateEvent } from '../hooks/useEvents';
import type { NewAttendee } from '../types';

type Row = Record<string, string>;

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [nameCol, setNameCol] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const createEvent = useCreateEvent();

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target?.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false });
      setRows(json);
      const cols = json.length ? Object.keys(json[0]) : [];
      setColumns(cols);
      setNameCol((prev) => prev || cols.find((c) => /name/i.test(c)) || cols[0] || '');
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleImport() {
    const attendees: NewAttendee[] = rows
      .map((row) => {
        const fullName = String(row[nameCol] ?? '').trim();
        const extra: Record<string, string> = {};
        for (const col of columns) {
          if (col !== nameCol && row[col] !== '') extra[col] = String(row[col]);
        }
        return { fullName, extra };
      })
      .filter((a) => a.fullName);

    await createEvent.mutateAsync({ name: eventName.trim(), date: eventDate, attendees });
    onClose();
  }

  const canImport = eventName.trim() && nameCol && rows.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Import event spreadsheet</h2>

        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="mb-4 block w-full text-sm"
        />

        {columns.length > 0 && (
          <div className="space-y-3">
            <label className="block text-sm">
              Event name
              <input
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
                placeholder="Roadshow June"
              />
            </label>
            <label className="block text-sm">
              Event date
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Which column is the attendee name?
              <select
                value={nameCol}
                onChange={(e) => setNameCol(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              >
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-gray-500">
              {rows.length} rows detected. Other columns are kept for search.
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!canImport || createEvent.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {createEvent.isPending ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components
git commit -m "feat(frontend): spreadsheet import with column mapping"
```

---

### Task 6: Event selector, attendee table/rows, search + filter, batch print

**Files:**

- Create: `frontend/src/components/EventSelector.tsx`, `AttendeeRow.tsx`, `AttendeeTable.tsx`

- [ ] **Step 1: Write `frontend/src/components/EventSelector.tsx`**

```tsx
import { useEvents } from '../hooks/useEvents';

export function EventSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { data: events = [] } = useEvents();
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border px-3 py-2 text-sm"
    >
      <option value="" disabled>
        Select an event…
      </option>
      {events.map((ev) => (
        <option key={ev._id} value={ev._id}>
          {ev.name} ({ev.attendeeCount ?? 0})
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Write `frontend/src/components/AttendeeRow.tsx`**

```tsx
import { usePrintAttendee } from '../hooks/usePrintAttendee';
import type { Attendee } from '../types';

export function AttendeeRow({
  attendee,
  selected,
  onToggle,
}: {
  attendee: Attendee;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const print = usePrintAttendee();
  const printed = attendee.printStatus === 'printed';

  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <input type="checkbox" checked={selected} onChange={() => onToggle(attendee._id)} />
      </td>
      <td className="px-3 py-2 font-medium">{attendee.fullName}</td>
      <td className="px-3 py-2 text-sm text-gray-500">
        {Object.values(attendee.extra).join(' · ')}
      </td>
      <td className="px-3 py-2">
        {printed ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
            Printed{attendee.printCount > 1 ? ` ×${attendee.printCount}` : ''}
          </span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            Not printed
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={() => print.mutate(attendee)}
          disabled={print.isPending}
          className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {printed ? 'Reprint' : 'Print badge'}
        </button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 3: Write `frontend/src/components/AttendeeTable.tsx`**

Owns search/filter state, selection, and the sequential batch-print loop.

```tsx
import { useState } from 'react';
import { useAttendees } from '../hooks/useAttendees';
import { usePrintAttendee } from '../hooks/usePrintAttendee';
import { AttendeeRow } from './AttendeeRow';

export function AttendeeTable({ eventId }: { eventId: string }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: attendees = [], isLoading } = useAttendees(eventId, search, status);
  const print = usePrintAttendee();
  const [batchRunning, setBatchRunning] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function batchPrint() {
    const targets = attendees.filter((a) => selected.has(a._id));
    setBatchRunning(true);
    try {
      for (const a of targets) {
        await print.mutateAsync(a); // sequential — one label at a time
      }
      setSelected(new Set());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Batch print failed');
    } finally {
      setBatchRunning(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or details…"
          className="grow rounded-md border px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          <option value="">All</option>
          <option value="not_printed">Not printed</option>
          <option value="printed">Printed</option>
        </select>
        <button
          onClick={batchPrint}
          disabled={selected.size === 0 || batchRunning}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {batchRunning ? 'Printing…' : `Print selected (${selected.size})`}
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <table className="w-full overflow-hidden rounded-lg border">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Details</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {attendees.map((a) => (
              <AttendeeRow
                key={a._id}
                attendee={a}
                selected={selected.has(a._id)}
                onToggle={toggle}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components
git commit -m "feat(frontend): event selector, attendee table, search/filter, batch print"
```

---

### Task 7: Badge preview tray (PreviewPrinter output)

**Files:**

- Create: `frontend/src/components/BadgePreviewTray.tsx`

- [ ] **Step 1: Write `frontend/src/components/BadgePreviewTray.tsx`**

Renders each printed job as a true-proportion 80×60mm card (uppercase centered name) and offers a raw-TSPL download. This is what makes "printing" visible while there's no hardware.

```tsx
import { usePreviewStore } from '../store/previewStore';

function downloadTspl(name: string, tspl: string) {
  const blob = new Blob([tspl], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `badge-${name.replace(/\s+/g, '_')}.tspl.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BadgePreviewTray() {
  const { jobs, clear } = usePreviewStore();
  if (jobs.length === 0) return null;

  return (
    <div className="mt-6 rounded-lg border bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Badge preview ({jobs.length})</h3>
        <button onClick={clear} className="text-xs text-gray-500 hover:text-gray-800">
          Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        {jobs.map((job, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            {/* 80mm x 60mm at ~3px/mm => 240x180 */}
            <div
              className="flex items-center justify-center border-2 border-gray-400 bg-white text-center"
              style={{ width: 240, height: 180 }}
            >
              <span className="px-2 text-xl font-bold uppercase">{job.name}</span>
            </div>
            <button
              onClick={() => downloadTspl(job.name, job.tspl)}
              className="text-xs text-blue-600 hover:underline"
            >
              Download TSPL
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components
git commit -m "feat(frontend): badge preview tray for no-hardware printing"
```

---

### Task 8: Assemble the app shell

**Files:**

- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Replace `frontend/src/App.tsx`**

```tsx
import { useState } from 'react';
import { PrinterStatus } from './components/PrinterStatus';
import { EventSelector } from './components/EventSelector';
import { AttendeeTable } from './components/AttendeeTable';
import { ImportDialog } from './components/ImportDialog';
import { BadgePreviewTray } from './components/BadgePreviewTray';

export default function App() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Roadshow Badge Printing</h1>
        <PrinterStatus />
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <EventSelector value={eventId} onChange={setEventId} />
        <button
          onClick={() => setImporting(true)}
          className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Import spreadsheet
        </button>
      </div>

      {eventId ? (
        <AttendeeTable eventId={eventId} />
      ) : (
        <p className="text-gray-500">Select or import an event to begin.</p>
      )}

      <BadgePreviewTray />

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: Full manual verification (PreviewPrinter mode)**

With the **backend running** (`cd backend && npm run dev`) and **frontend running** (`cd frontend && npm run dev`), open `http://localhost:5173` in Chrome and confirm:

1. Header shows **"Preview mode"** (green).
2. **Import spreadsheet** → pick a `.xlsx`/`.csv` → choose the name column → name the event → **Import**. Dialog closes.
3. The event appears in the selector with the right count; selecting it lists attendees.
4. **Search** filters by name/details; the **status** dropdown filters printed/not-printed.
5. Click **Print badge** on a row → a badge card appears in the preview tray (uppercase, centered); the row flips to **Printed**.
6. **Download TSPL** produces a `.tspl.txt` file containing `SIZE 80 mm, 60 mm` … `PRINT 1`.
7. Select several rows → **Print selected (N)** → each prints in turn and all flip to Printed.
8. Click **Reprint** on a printed row → preview shows it again; status shows **×2**.

- [ ] **Step 3: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): assemble app shell and wire all components"
```

---

## When the printer arrives (flip to real printing)

- [ ] In `frontend/.env`, set `VITE_PRINTER_MODE=webusb`, restart dev/build.
- [ ] Click **Connect printer**, pick the Gainscha in the WebUSB prompt.
- [ ] On **Windows**, if the device doesn't appear/claim, bind it to **WinUSB** with Zadig (one-time) — see spec §9.
- [ ] Confirm the printed label is centered and correctly sized; if off, adjust `DEFAULT_DPI` in `buildBadgeTSPL.ts` (try 300) and the BLOCK ratios.

---

## Self-review checklist (run after implementing)

- [ ] Types in `types.ts` match the backend JSON exactly (field names, `printStatus` values).
- [ ] `usePrintAttendee` only marks printed **after** a successful adapter `print()`.
- [ ] Batch print is **sequential** (awaits each) so labels don't overlap.
- [ ] Preview mode works with **no printer** and downloadable TSPL is valid.
- [ ] `VITE_API_URL` points at the backend; CORS origin on the backend matches `http://localhost:5173`.
- [ ] Switching `VITE_PRINTER_MODE` is the only change needed to go live.
