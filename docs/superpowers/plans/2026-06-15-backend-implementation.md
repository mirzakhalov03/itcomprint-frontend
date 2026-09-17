# Roadshow Badge Printing — Backend Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note on tests:** Per the project owner's standing preference there is **no automated test suite**. Verification steps are **manual** (`curl` against a running server with expected JSON shown). Keep that in mind wherever a generic plan would say "write a test."

**Goal:** A small Express + TypeScript + MongoDB API that stores events and attendees imported from a spreadsheet, supports search/filter, and atomically records badge prints (and reprints) so the whole team sees consistent status.

**Architecture:** Layered Express app (`routes → controllers → services → models`) with Zod validation middleware and Mongoose for MongoDB. The browser does all printing; the backend owns **data only**. Spreadsheet parsing happens in the frontend, so the API receives clean JSON (no file uploads).

**Tech Stack:** Node, Express, TypeScript, Mongoose (MongoDB), Zod, cors, dotenv, tsx (dev runner).

**Spec:** `docs/superpowers/specs/2026-06-15-roadshow-badge-printing-design.md`

---

## API surface (target)

| Method | Path                        | Purpose                                                                                                                              |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `POST` | `/api/events`               | Create an event + its attendees (bulk) from imported data                                                                            |
| `GET`  | `/api/events`               | List events (with attendee counts)                                                                                                   |
| `GET`  | `/api/events/:id`           | Get one event                                                                                                                        |
| `GET`  | `/api/events/:id/attendees` | List attendees; query `?search=&status=printed                                                                                       | not_printed` |
| `POST` | `/api/attendees/:id/print`  | Atomically mark printed: `$inc printCount`, set `printStatus='printed'`, `lastPrintedAt=now`. Used for both first print and reprint. |
| `GET`  | `/api/health`               | Liveness check                                                                                                                       |

### Shared JSON shapes (must match the frontend plan)

```ts
// Event
{ _id: string; name: string; date: string; createdAt: string; attendeeCount?: number }

// Attendee
{
  _id: string; eventId: string; fullName: string;
  extra: Record<string, string>;
  printStatus: 'not_printed' | 'printed';
  printCount: number;
  lastPrintedAt: string | null;
}

// POST /api/events body
{ name: string; date: string; attendees: { fullName: string; extra: Record<string,string> }[] }
```

---

## File structure

```
backend/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── src/
    ├── server.ts                      # entry: connect db, start listening
    ├── app.ts                         # express app + middleware wiring
    ├── config/
    │   ├── env.ts                     # load + Zod-validate process.env
    │   └── db.ts                      # mongoose connection
    ├── models/
    │   ├── event.model.ts
    │   └── attendee.model.ts
    ├── validators/
    │   ├── event.validators.ts
    │   └── attendee.validators.ts
    ├── services/
    │   ├── event.services.ts
    │   └── attendee.services.ts
    ├── controllers/
    │   ├── event.controllers.ts
    │   └── attendee.controllers.ts
    ├── routes/
    │   ├── index.ts
    │   ├── event.routes.ts
    │   └── attendee.routes.ts
    ├── middlewares/
    │   ├── validate.middleware.ts     # runs a Zod schema over req
    │   └── error.middleware.ts        # central error handler
    └── utils/
        └── asyncHandler.ts            # wraps async controllers
```

---

### Task 0: Initialize the backend project

**Files:**

- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/.env.example`, `backend/.gitignore`

- [ ] **Step 1: Init git at root (if not already) and create the backend package**

```bash
cd /Users/mn.afridi/Desktop/ItComPrint
git rev-parse --is-inside-work-tree 2>/dev/null || git init
cd backend
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install express mongoose zod cors dotenv
npm install -D typescript tsx @types/express @types/cors @types/node
```

- [ ] **Step 3: Write `backend/package.json` scripts** (replace the `"scripts"` block)

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

- [ ] **Step 4: Write `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Write `backend/.env.example`**

```
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/roadshow_badges
CORS_ORIGIN=http://localhost:5173
```

- [ ] **Step 6: Write `backend/.gitignore`**

```
node_modules
dist
.env
```

- [ ] **Step 7: Create your real `.env`**

```bash
cp .env.example .env
```

(For a hosted MongoDB, paste an Atlas connection string into `MONGODB_URI`.)

- [ ] **Step 8: Commit**

```bash
cd /Users/mn.afridi/Desktop/ItComPrint
git add backend OptionB.md docs
git commit -m "chore(backend): scaffold Express + TS + Mongoose project"
```

---

### Task 1: Environment config + MongoDB connection

**Files:**

- Create: `backend/src/config/env.ts`, `backend/src/config/db.ts`

- [ ] **Step 1: Write `backend/src/config/env.ts`**

```ts
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 2: Write `backend/src/config/db.ts`**

```ts
import mongoose from 'mongoose';
import { env } from './env';

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);
  console.log('[db] connected to MongoDB');
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/config
git commit -m "feat(backend): env validation and mongo connection"
```

---

### Task 2: Mongoose models

**Files:**

- Create: `backend/src/models/event.model.ts`, `backend/src/models/attendee.model.ts`

- [ ] **Step 1: Write `backend/src/models/event.model.ts`**

```ts
import { Schema, model, Document } from 'mongoose';

export interface EventDoc extends Document {
  name: string;
  date: Date;
  createdAt: Date;
}

const eventSchema = new Schema<EventDoc>({
  name: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const EventModel = model<EventDoc>('Event', eventSchema);
```

- [ ] **Step 2: Write `backend/src/models/attendee.model.ts`**

`searchText` is a denormalized lowercase blob (name + all extra values) so search is a single fast regex.

```ts
import { Schema, model, Document, Types } from 'mongoose';

export type PrintStatus = 'not_printed' | 'printed';

export interface AttendeeDoc extends Document {
  eventId: Types.ObjectId;
  fullName: string;
  extra: Record<string, string>;
  searchText: string;
  printStatus: PrintStatus;
  printCount: number;
  lastPrintedAt: Date | null;
}

const attendeeSchema = new Schema<AttendeeDoc>({
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  fullName: { type: String, required: true, trim: true },
  extra: { type: Schema.Types.Mixed, default: {} },
  searchText: { type: String, default: '' },
  printStatus: { type: String, enum: ['not_printed', 'printed'], default: 'not_printed' },
  printCount: { type: Number, default: 0 },
  lastPrintedAt: { type: Date, default: null },
});

attendeeSchema.index({ eventId: 1, searchText: 1 });

export const AttendeeModel = model<AttendeeDoc>('Attendee', attendeeSchema);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/models
git commit -m "feat(backend): Event and Attendee models"
```

---

### Task 3: App wiring, middleware, server entry

**Files:**

- Create: `backend/src/utils/asyncHandler.ts`, `backend/src/middlewares/error.middleware.ts`, `backend/src/middlewares/validate.middleware.ts`, `backend/src/app.ts`, `backend/src/server.ts`, `backend/src/routes/index.ts`

- [ ] **Step 1: Write `backend/src/utils/asyncHandler.ts`**

```ts
import { Request, Response, NextFunction, RequestHandler } from 'express';

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
```

- [ ] **Step 2: Write `backend/src/middlewares/error.middleware.ts`**

```ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'ValidationError', details: err.flatten() });
  }
  console.error('[error]', err);
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  return res.status(500).json({ error: message });
}
```

- [ ] **Step 3: Write `backend/src/middlewares/validate.middleware.ts`**

A factory that validates `body`, `query`, or `params` against a Zod schema and replaces the request part with the parsed value.

```ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

type Part = 'body' | 'query' | 'params';

export const validate =
  (schema: ZodSchema, part: Part = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse(req[part]);
    // @ts-expect-error – we intentionally overwrite the validated part
    req[part] = parsed;
    next();
  };
```

- [ ] **Step 4: Write `backend/src/routes/index.ts`** (placeholder router; real routes added in later tasks)

```ts
import { Router } from 'express';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
```

- [ ] **Step 5: Write `backend/src/app.ts`**

```ts
import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { apiRouter } from './routes';
import { errorHandler } from './middlewares/error.middleware';

export function createApp() {
  const app = express();
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '5mb' })); // imports can be large
  app.use('/api', apiRouter);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 6: Write `backend/src/server.ts`**

```ts
import { createApp } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(env.PORT, () => console.log(`[server] listening on :${env.PORT}`));
}

main().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
```

- [ ] **Step 7: Run and verify health endpoint**

Run (in one terminal): `cd backend && npm run dev`
Then: `curl -s http://localhost:4000/api/health`
Expected: `{"ok":true}` and `[db] connected to MongoDB` in the server log.

- [ ] **Step 8: Commit**

```bash
git add backend/src
git commit -m "feat(backend): app wiring, middleware, health endpoint"
```

---

### Task 4: Validators

**Files:**

- Create: `backend/src/validators/event.validators.ts`, `backend/src/validators/attendee.validators.ts`

- [ ] **Step 1: Write `backend/src/validators/event.validators.ts`**

```ts
import { z } from 'zod';

export const createEventSchema = z.object({
  name: z.string().min(1),
  date: z.string().min(1), // ISO date string
  attendees: z
    .array(
      z.object({
        fullName: z.string().min(1),
        extra: z.record(z.string(), z.string()).default({}),
      }),
    )
    .min(1, 'At least one attendee is required'),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const eventIdParamSchema = z.object({ id: z.string().min(1) });
```

- [ ] **Step 2: Write `backend/src/validators/attendee.validators.ts`**

```ts
import { z } from 'zod';

export const listAttendeesQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['printed', 'not_printed']).optional(),
});

export type ListAttendeesQuery = z.infer<typeof listAttendeesQuerySchema>;

export const attendeeIdParamSchema = z.object({ id: z.string().min(1) });
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/validators
git commit -m "feat(backend): Zod validators for events and attendees"
```

---

### Task 5: Event service, controller, routes

**Files:**

- Create: `backend/src/services/event.services.ts`, `backend/src/controllers/event.controllers.ts`, `backend/src/routes/event.routes.ts`
- Modify: `backend/src/routes/index.ts`

- [ ] **Step 1: Write `backend/src/services/event.services.ts`**

```ts
import { EventModel } from '../models/event.model';
import { AttendeeModel } from '../models/attendee.model';
import { CreateEventInput } from '../validators/event.validators';

function buildSearchText(fullName: string, extra: Record<string, string>): string {
  return [fullName, ...Object.values(extra)].join(' ').toLowerCase();
}

export async function createEventWithAttendees(input: CreateEventInput) {
  const event = await EventModel.create({ name: input.name, date: new Date(input.date) });

  const docs = input.attendees.map((a) => ({
    eventId: event._id,
    fullName: a.fullName,
    extra: a.extra,
    searchText: buildSearchText(a.fullName, a.extra),
  }));
  await AttendeeModel.insertMany(docs);

  return { ...event.toObject(), attendeeCount: docs.length };
}

export async function listEvents() {
  const events = await EventModel.find().sort({ date: -1 }).lean();
  const counts = await AttendeeModel.aggregate<{ _id: unknown; count: number }>([
    { $group: { _id: '$eventId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  return events.map((e) => ({ ...e, attendeeCount: countMap.get(String(e._id)) ?? 0 }));
}

export async function getEvent(id: string) {
  return EventModel.findById(id).lean();
}
```

- [ ] **Step 2: Write `backend/src/controllers/event.controllers.ts`**

```ts
import { Request, Response } from 'express';
import * as eventService from '../services/event.services';

export async function create(req: Request, res: Response) {
  const event = await eventService.createEventWithAttendees(req.body);
  res.status(201).json(event);
}

export async function list(_req: Request, res: Response) {
  res.json(await eventService.listEvents());
}

export async function getOne(req: Request, res: Response) {
  const event = await eventService.getEvent(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
}
```

- [ ] **Step 3: Write `backend/src/routes/event.routes.ts`**

```ts
import { Router } from 'express';
import * as controller from '../controllers/event.controllers';
import { validate } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { createEventSchema, eventIdParamSchema } from '../validators/event.validators';

export const eventRouter = Router();

eventRouter.post('/', validate(createEventSchema), asyncHandler(controller.create));
eventRouter.get('/', asyncHandler(controller.list));
eventRouter.get('/:id', validate(eventIdParamSchema, 'params'), asyncHandler(controller.getOne));
```

- [ ] **Step 4: Mount the event router — edit `backend/src/routes/index.ts`**

Replace the file contents with:

```ts
import { Router } from 'express';
import { eventRouter } from './event.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
apiRouter.use('/events', eventRouter);
```

- [ ] **Step 5: Verify create + list with curl**

With `npm run dev` running:

```bash
curl -s -X POST http://localhost:4000/api/events \
  -H 'Content-Type: application/json' \
  -d '{"name":"Roadshow June","date":"2026-06-20","attendees":[{"fullName":"john smith","extra":{"role":"Speaker"}},{"fullName":"jane doe","extra":{}}]}'
```

Expected: `201` with JSON containing `"attendeeCount":2`.

```bash
curl -s http://localhost:4000/api/events
```

Expected: an array with the event and `"attendeeCount":2`.

- [ ] **Step 6: Commit**

```bash
git add backend/src
git commit -m "feat(backend): event create/list/get endpoints"
```

---

### Task 6: Attendee service, controller, routes (search, filter, print)

**Files:**

- Create: `backend/src/services/attendee.services.ts`, `backend/src/controllers/attendee.controllers.ts`, `backend/src/routes/attendee.routes.ts`
- Modify: `backend/src/routes/index.ts`

- [ ] **Step 1: Write `backend/src/services/attendee.services.ts`**

```ts
import { AttendeeModel } from '../models/attendee.model';
import { ListAttendeesQuery } from '../validators/attendee.validators';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listAttendees(eventId: string, query: ListAttendeesQuery) {
  const filter: Record<string, unknown> = { eventId };
  if (query.status) filter.printStatus = query.status;
  if (query.search) {
    filter.searchText = { $regex: escapeRegex(query.search.toLowerCase()) };
  }
  return AttendeeModel.find(filter).sort({ fullName: 1 }).lean();
}

export async function markPrinted(attendeeId: string) {
  return AttendeeModel.findByIdAndUpdate(
    attendeeId,
    {
      $inc: { printCount: 1 },
      $set: { printStatus: 'printed', lastPrintedAt: new Date() },
    },
    { new: true },
  ).lean();
}
```

- [ ] **Step 2: Write `backend/src/controllers/attendee.controllers.ts`**

```ts
import { Request, Response } from 'express';
import * as attendeeService from '../services/attendee.services';

export async function listByEvent(req: Request, res: Response) {
  const attendees = await attendeeService.listAttendees(req.params.id, req.query);
  res.json(attendees);
}

export async function print(req: Request, res: Response) {
  const attendee = await attendeeService.markPrinted(req.params.id);
  if (!attendee) return res.status(404).json({ error: 'Attendee not found' });
  res.json(attendee);
}
```

- [ ] **Step 3: Write `backend/src/routes/attendee.routes.ts`**

This file exposes the print route. The "list attendees by event" route is mounted under events in the next step.

```ts
import { Router } from 'express';
import * as controller from '../controllers/attendee.controllers';
import { validate } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { attendeeIdParamSchema } from '../validators/attendee.validators';

export const attendeeRouter = Router();

attendeeRouter.post(
  '/:id/print',
  validate(attendeeIdParamSchema, 'params'),
  asyncHandler(controller.print),
);
```

- [ ] **Step 4: Add the nested list route to the event router — edit `backend/src/routes/event.routes.ts`**

Add these imports and route to the existing file:

```ts
import * as attendeeController from '../controllers/attendee.controllers';
import { listAttendeesQuerySchema } from '../validators/attendee.validators';

// ...after the existing routes:
eventRouter.get(
  '/:id/attendees',
  validate(eventIdParamSchema, 'params'),
  validate(listAttendeesQuerySchema, 'query'),
  asyncHandler(attendeeController.listByEvent),
);
```

- [ ] **Step 5: Mount the attendee router — edit `backend/src/routes/index.ts`**

Replace contents with:

```ts
import { Router } from 'express';
import { eventRouter } from './event.routes';
import { attendeeRouter } from './attendee.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
apiRouter.use('/events', eventRouter);
apiRouter.use('/attendees', attendeeRouter);
```

- [ ] **Step 6: Verify search, filter, and print with curl**

Grab an event id from `GET /api/events`, then (replace `EVENT_ID`):

```bash
curl -s "http://localhost:4000/api/events/EVENT_ID/attendees?search=jane"
```

Expected: array containing only Jane Doe.

```bash
curl -s "http://localhost:4000/api/events/EVENT_ID/attendees?status=not_printed"
```

Expected: both attendees (none printed yet).

Grab an attendee id from that response, then (replace `ATTENDEE_ID`):

```bash
curl -s -X POST http://localhost:4000/api/attendees/ATTENDEE_ID/print
```

Expected: that attendee with `"printStatus":"printed"`, `"printCount":1`, and a non-null `lastPrintedAt`. Run it again → `"printCount":2` (this is the reprint path).

- [ ] **Step 7: Commit**

```bash
git add backend/src
git commit -m "feat(backend): attendee list/search/filter and atomic print endpoint"
```

---

## Self-review checklist (run after implementing)

- [ ] `POST /api/events` creates an event and inserts attendees with `searchText` populated.
- [ ] `GET /api/events` returns `attendeeCount` per event.
- [ ] `GET /api/events/:id/attendees` honors both `search` and `status`.
- [ ] `POST /api/attendees/:id/print` increments `printCount` atomically and is reused for reprints.
- [ ] CORS origin matches the frontend dev URL (`http://localhost:5173`).
- [ ] No secrets committed (`.env` is gitignored; only `.env.example` is tracked).
