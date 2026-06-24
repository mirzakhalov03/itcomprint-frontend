# Roadshow Badges — Frontend

Kiosk UI for printing attendee name badges at IT Community of Uzbekistan events.
Vite + React 19 + TypeScript + Tailwind v4. Client state in Zustand, server state in React Query.

## Local development

```bash
npm install
cp .env.example .env   # then edit values
npm run dev            # http://localhost:5173
```

Requires the backend running (default `http://localhost:4000/api`).

| Script            | Does                          |
| ----------------- | ----------------------------- |
| `npm run dev`     | Vite dev server (port 5173)   |
| `npm run build`   | Type-check + production build |
| `npm run lint`    | ESLint                        |
| `npm run preview` | Serve the built `dist/`       |

## Environment

`.env` is gitignored — copy `.env.example` and fill it in.

| Variable            | Purpose                                                       |
| ------------------- | ------------------------------------------------------------- |
| `VITE_API_URL`      | Backend base URL **including `/api`**, no trailing slash.     |
| `VITE_PRINTER_MODE` | `preview` (on-screen badges) or `webusb` (Gainscha hardware). |

Vite bakes `VITE_*` vars in at **build** time, so changing them requires a rebuild/redeploy.

## Deploy to Vercel

1. New Project → import the repo → set **Root Directory** to `frontend/`.
   Framework (Vite), build command, and output dir are picked up from `vercel.json`.
2. Add the env vars above under **Settings → Environment Variables** (Production).
   Dashboard values override the committed defaults at build time.
3. Deploy. `vercel.json` handles SPA routing (all paths → `index.html`) and long-cache
   headers for hashed assets.

**Note:** `webusb` printing needs Chrome/Edge over HTTPS and is **not yet tested on hardware** —
ship with `VITE_PRINTER_MODE=preview` until the Gainscha printer is verified (confirm 203 DPI in
`src/printer/buildBadgeTSPL.ts`).

## Build output

The xlsx parser is code-split behind the lazy `ImportDialog`, so the initial load is small
(~80 KB gzip app + vendor); the ~125 KB gzip spreadsheet chunk loads only when an operator
opens Import.
