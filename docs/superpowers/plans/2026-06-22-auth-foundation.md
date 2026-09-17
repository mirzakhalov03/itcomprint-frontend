# Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-hosted Google sign-in, a session-cookie guard around the existing kiosk, a first-login name-confirm step, and an author stamp on events.

**Architecture:** The frontend gets a Google Identity Services button that yields an ID token; the Express backend verifies it with `google-auth-library`, upserts a `User` in Mongo, and issues a signed JWT in an httpOnly cookie. A `requireAuth` middleware guards `/events` and `/attendees`. The frontend gains client-side routing (`react-router-dom`) with `/login`, `/onboarding`, and the existing kiosk at `/app`, all gated by a `RequireAuth` component reading `GET /auth/me`.

**Tech Stack:** Backend — Express 5, Mongoose 9, Zod 4, `google-auth-library`, `jsonwebtoken`, `cookie-parser`. Frontend — React 19, React Query, Zustand, `react-router-dom`, Google Identity Services (loaded via script tag).

## Global Constraints

- **Backend layering:** `routes → controllers → services → models`, plus `validators/` (Zod), `middlewares/`, `utils/`. Controllers stay thin; all DB/business logic in services. Copy this exactly.
- **Route shape:** attach `validate(schema, part)` then wrap handlers in `asyncHandler`. Async middleware (like `requireAuth`) is also wrapped in `asyncHandler` when mounted.
- **Express 5 `req.query` is getter-only** — never assign to it. Not touched by this plan, but don't "simplify" `validate.middleware.ts`.
- **Fail-fast config:** every new env var is added to `config/env.ts`'s Zod schema. Missing config crashes on boot.
- **No new test frameworks.** Backend is verified by `scripts/verify.ts` (`npm run verify`); frontend by `npm run build` + `npm run lint` and the manual checklist in the final task. Per project preference, do not add unit tests.
- **Error handling:** throw real errors from services; the existing `errorHandler` formats them. For expected auth failures (bad token, no session) return explicit `401` JSON from the controller/middleware.
- **Design tokens:** UI uses generated Tailwind utilities (`bg-ink`, `text-brand`, `bg-surface`, etc.) from `frontend/src/index.css` `@theme`. Never raw hex in components.
- **Cookie name** is `session` everywhere. **Auth query key** is `['auth','me']` everywhere. **Test-token prefix** is `test|` everywhere.

> **Git note:** this workspace is **not a git repository** (`backend/` is untracked, root is not initialized). Each task ends with a **checkpoint** (build/verify), not a commit. The `Commit` step in each task is optional — run it only if you first `git init`. Treat a green checkpoint as the gate to the next task.

---

## File Structure

**Backend (create)**

- `backend/src/models/user.model.ts` — User schema
- `backend/src/utils/jwt.ts` — sign/verify session JWT
- `backend/src/utils/authCookie.ts` — set/clear the session cookie
- `backend/src/services/auth.services.ts` — Google verify (with test bypass), user upsert, name update
- `backend/src/validators/auth.validators.ts` — Zod schemas
- `backend/src/controllers/auth.controllers.ts` — thin handlers
- `backend/src/routes/auth.routes.ts` — `/auth` router
- `backend/src/middlewares/requireAuth.middleware.ts` — session guard
- `backend/src/types/express.d.ts` — `req.user` type augmentation

**Backend (modify)**

- `backend/src/config/env.ts` — add `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `COOKIE_DOMAIN`
- `backend/src/app.ts` — `cookie-parser`, CORS `credentials: true`
- `backend/src/routes/index.ts` — mount `/auth`, guard `/events` + `/attendees`
- `backend/src/models/event.model.ts` — `authorId`, `authorName`, `authorPicture`
- `backend/src/services/event.services.ts` — stamp author on create
- `backend/src/controllers/event.controllers.ts` — pass `req.user` to service
- `backend/scripts/verify.ts` — seed new env, authenticate, assert auth flow
- `backend/scripts/smoke.ts` — seed new env so the prod boot succeeds
- `backend/.env.example` — document new vars

**Frontend (create)**

- `frontend/src/lib/google.ts` — Google Identity Services script loader
- `frontend/src/types/google.d.ts` — minimal `window.google` typing
- `frontend/src/hooks/useAuth.ts` — auth query + mutations
- `frontend/src/components/RequireAuth.tsx` — guard
- `frontend/src/components/GoogleSignInButton.tsx` — renders the GIS button
- `frontend/src/components/UserMenu.tsx` — name chip + logout
- `frontend/src/pages/LoginPage.tsx` — public cover-lite + sign-in
- `frontend/src/pages/OnboardingPage.tsx` — confirm name
- `frontend/src/pages/KioskPage.tsx` — the current App body, moved

**Frontend (modify)**

- `frontend/src/types.ts` — `AuthUser`, event author fields
- `frontend/src/lib/api.ts` — `credentials: 'include'`, auth methods
- `frontend/src/App.tsx` — becomes the router shell
- `frontend/src/components/Header.tsx` — mount `UserMenu`
- `frontend/.env` — add `VITE_GOOGLE_CLIENT_ID`

---

## Task 1: Backend dependencies, env config, app middleware, harness env seeding

**Files:**

- Modify: `backend/package.json` (via npm)
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/scripts/verify.ts:24-28`
- Modify: `backend/scripts/smoke.ts:11-14`
- Modify: `backend/.env.example`

**Interfaces:**

- Produces: `env.GOOGLE_CLIENT_ID: string`, `env.JWT_SECRET: string`, `env.COOKIE_DOMAIN: string | undefined`. App now parses cookies and allows credentialed CORS.

- [ ] **Step 1: Install dependencies**

```bash
cd backend
npm install google-auth-library jsonwebtoken cookie-parser
npm install -D @types/jsonwebtoken @types/cookie-parser
```

- [ ] **Step 2: Add env vars to the Zod schema**

In `backend/src/config/env.ts`, add three fields inside `z.object({ ... })` after `CORS_ORIGIN`:

```ts
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Google OAuth 2.0 Web client ID; also the expected ID-token audience.
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  // Secret used to sign session JWTs. Keep private; min length guards weak secrets.
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  // Optional cookie domain for cross-subdomain sessions in production.
  COOKIE_DOMAIN: z.string().optional(),
```

- [ ] **Step 3: Wire cookie-parser and credentialed CORS in `app.ts`**

In `backend/src/app.ts`, add the import near the other imports:

```ts
import cookieParser from 'cookie-parser';
```

Add `credentials: true` to the `cors(...)` options object (alongside the `origin` function):

```ts
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // Allow non-browser clients (no Origin header) and any configured origin.
      if (!origin || corsOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
  }),
);
```

Add `cookieParser()` immediately after the `cors(...)` block and before `express.json`:

```ts
app.use(cookieParser());

app.use(express.json({ limit: '5mb' })); // imports can be large
```

- [ ] **Step 4: Seed new env in the verify harness so it keeps booting**

In `backend/scripts/verify.ts`, inside `main()` where the other `process.env.*` lines are (after `process.env.PORT = '4055';`), add:

```ts
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.JWT_SECRET = 'test-secret-at-least-16-chars-long';
```

- [ ] **Step 5: Seed new env in the smoke harness**

In `backend/scripts/smoke.ts`, extend the `env` object passed to `spawn` (line ~12) to include the two required vars:

```ts
    env: { ...process.env, NODE_ENV: 'production', PORT: '4066', MONGODB_URI: mongo.getUri('roadshow_badges'), CORS_ORIGIN: 'https://kiosk.example', GOOGLE_CLIENT_ID: 'smoke-client-id', JWT_SECRET: 'smoke-secret-at-least-16-chars' },
```

- [ ] **Step 6: Document the vars in `.env.example`**

Append to `backend/.env.example`:

```
# Google OAuth 2.0 Web client ID (also the ID-token audience)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
# Secret for signing session JWTs (>=16 chars, keep private)
JWT_SECRET=change-me-to-a-long-random-string
# Optional: cookie domain for cross-subdomain sessions in production
# COOKIE_DOMAIN=.itcom.uz
```

Also add the same two required vars to your local `backend/.env` so `npm run dev` boots.

- [ ] **Step 7: Checkpoint — build + verify still green**

```bash
cd backend
npm run build
npm run verify
```

Expected: build succeeds; verify prints `ALL PASSED` (the new env vars let the app boot; no behavior changed yet).

- [ ] **Step 8 (optional): Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/config/env.ts backend/src/app.ts backend/scripts/verify.ts backend/scripts/smoke.ts backend/.env.example
git commit -m "chore(auth): add auth deps, env vars, cookie-parser, credentialed CORS"
```

---

## Task 2: User model

**Files:**

- Create: `backend/src/models/user.model.ts`

**Interfaces:**

- Produces: `UserModel`, `UserDoc` with fields `googleId, email, displayName, googleName, picture, onboardedAt: Date | null, createdAt, lastLoginAt`.

- [ ] **Step 1: Create the model**

```ts
// backend/src/models/user.model.ts
import { Schema, model, Document } from 'mongoose';

export interface UserDoc extends Document {
  googleId: string;
  email: string;
  displayName: string;
  googleName: string;
  picture: string;
  onboardedAt: Date | null;
  createdAt: Date;
  lastLoginAt: Date;
}

const userSchema = new Schema<UserDoc>({
  googleId: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true },
  displayName: { type: String, required: true, trim: true },
  googleName: { type: String, default: '' },
  picture: { type: String, default: '' },
  // null until the user confirms their name on first login; the guard reads this.
  onboardedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: Date.now },
});

export const UserModel = model<UserDoc>('User', userSchema);
```

- [ ] **Step 2: Checkpoint — build**

```bash
cd backend && npm run build
```

Expected: compiles with no errors.

- [ ] **Step 3 (optional): Commit**

```bash
git add backend/src/models/user.model.ts
git commit -m "feat(auth): add User model"
```

---

## Task 3: JWT and cookie utilities

**Files:**

- Create: `backend/src/utils/jwt.ts`
- Create: `backend/src/utils/authCookie.ts`

**Interfaces:**

- Produces: `signSession(uid: string): string`, `verifySession(token: string): { uid: string } | null`, `SESSION_MAX_AGE_MS: number`, `SESSION_COOKIE: 'session'`, `setSessionCookie(res, token): void`, `clearSessionCookie(res): void`.

- [ ] **Step 1: Create the JWT util**

```ts
// backend/src/utils/jwt.ts
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const TTL_DAYS = 30;
export const SESSION_MAX_AGE_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

export interface SessionPayload {
  uid: string;
}

export function signSession(uid: string): string {
  // Use numeric seconds (not a "30d" string): @types/jsonwebtoken types the
  // string form as a branded literal, so a template string won't type-check.
  return jwt.sign({ uid }, env.JWT_SECRET, { expiresIn: SESSION_MAX_AGE_MS / 1000 });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      typeof (decoded as { uid?: unknown }).uid === 'string'
    ) {
      return { uid: (decoded as { uid: string }).uid };
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Create the cookie util**

```ts
// backend/src/utils/authCookie.ts
import { Response } from 'express';
import { env, isProd } from '../config/env';
import { SESSION_MAX_AGE_MS } from './jwt';

export const SESSION_COOKIE = 'session';

// Cross-origin (frontend on a different domain) needs SameSite=None; Secure in
// production. In dev, frontend and API share the localhost site, so Lax works
// and avoids the Secure requirement over http.
function baseOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    domain: env.COOKIE_DOMAIN,
    path: '/',
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...baseOptions(), maxAge: SESSION_MAX_AGE_MS });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, baseOptions());
}
```

- [ ] **Step 3: Checkpoint — build**

```bash
cd backend && npm run build
```

Expected: compiles with no errors.

- [ ] **Step 4 (optional): Commit**

```bash
git add backend/src/utils/jwt.ts backend/src/utils/authCookie.ts
git commit -m "feat(auth): add session JWT and cookie helpers"
```

---

## Task 4: Auth service

**Files:**

- Create: `backend/src/services/auth.services.ts`

**Interfaces:**

- Consumes: `UserModel`, `UserDoc` (Task 2); `env`, `isTest` (Task 1).
- Produces:
  - `verifyGoogleIdToken(idToken: string): Promise<GoogleProfile>` where `GoogleProfile = { sub, email, name, picture }`
  - `upsertUserFromGoogle(profile: GoogleProfile): Promise<{ user: UserDoc; isNewUser: boolean }>`
  - `getUserById(id: string): Promise<UserDoc | null>`
  - `updateDisplayName(id: string, displayName: string): Promise<UserDoc | null>`
  - `toPublicUser(user: UserDoc): { id, email, displayName, picture, onboardedAt }`

- [ ] **Step 1: Create the service**

```ts
// backend/src/services/auth.services.ts
import { OAuth2Client } from 'google-auth-library';
import { UserModel, UserDoc } from '../models/user.model';
import { env, isTest } from '../config/env';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

/**
 * Verify a Google ID token and return the profile.
 *
 * TEST BYPASS: when NODE_ENV=test, a token of the form
 *   test|{"sub":"...","email":"...","name":"...","picture":"..."}
 * is parsed directly, so scripts/verify.ts can exercise auth without
 * minting real Google-signed tokens. `isTest` is false in dev and prod,
 * so this branch is dead code outside the harness.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (isTest && idToken.startsWith('test|')) {
    return JSON.parse(idToken.slice('test|'.length)) as GoogleProfile;
  }
  const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error('Invalid Google token payload');
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
    picture: payload.picture ?? '',
  };
}

export async function upsertUserFromGoogle(
  profile: GoogleProfile,
): Promise<{ user: UserDoc; isNewUser: boolean }> {
  const existing = await UserModel.findOne({ googleId: profile.sub });
  if (existing) {
    existing.email = profile.email;
    existing.googleName = profile.name;
    existing.picture = profile.picture;
    existing.lastLoginAt = new Date();
    await existing.save();
    return { user: existing, isNewUser: false };
  }
  const user = await UserModel.create({
    googleId: profile.sub,
    email: profile.email,
    displayName: profile.name, // sensible default until the user confirms it
    googleName: profile.name,
    picture: profile.picture,
    onboardedAt: null,
    lastLoginAt: new Date(),
  });
  return { user, isNewUser: true };
}

export async function getUserById(id: string): Promise<UserDoc | null> {
  return UserModel.findById(id);
}

export async function updateDisplayName(id: string, displayName: string): Promise<UserDoc | null> {
  const user = await UserModel.findById(id);
  if (!user) return null;
  user.displayName = displayName;
  if (!user.onboardedAt) user.onboardedAt = new Date();
  await user.save();
  return user;
}

export function toPublicUser(user: UserDoc) {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    picture: user.picture,
    onboardedAt: user.onboardedAt,
  };
}
```

- [ ] **Step 2: Checkpoint — build**

```bash
cd backend && npm run build
```

Expected: compiles with no errors.

- [ ] **Step 3 (optional): Commit**

```bash
git add backend/src/services/auth.services.ts
git commit -m "feat(auth): add auth service (google verify, user upsert)"
```

---

## Task 5: requireAuth middleware and `req.user` typing

**Files:**

- Create: `backend/src/middlewares/requireAuth.middleware.ts`
- Create: `backend/src/types/express.d.ts`

**Interfaces:**

- Consumes: `verifySession` (Task 3), `SESSION_COOKIE` (Task 3), `getUserById` (Task 4).
- Produces: `requireAuth(req, res, next): Promise<void>` that sets `req.user: UserDoc` or responds `401`. Augments Express `Request` with `user?: UserDoc`.

- [ ] **Step 1: Augment the Express Request type**

```ts
// backend/src/types/express.d.ts
import { UserDoc } from '../models/user.model';

declare global {
  namespace Express {
    interface Request {
      user?: UserDoc;
    }
  }
}

export {};
```

- [ ] **Step 2: Create the guard**

```ts
// backend/src/middlewares/requireAuth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { verifySession } from '../utils/jwt';
import { SESSION_COOKIE } from '../utils/authCookie';
import { getUserById } from '../services/auth.services';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const payload = verifySession(token);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const user = await getUserById(payload.uid);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.user = user;
  next();
}
```

- [ ] **Step 3: Checkpoint — build**

```bash
cd backend && npm run build
```

Expected: compiles with no errors (`req.cookies` is typed by `cookie-parser`, `req.user` by the new d.ts).

- [ ] **Step 4 (optional): Commit**

```bash
git add backend/src/middlewares/requireAuth.middleware.ts backend/src/types/express.d.ts
git commit -m "feat(auth): add requireAuth guard and req.user typing"
```

---

## Task 6: Auth validators, controllers, routes, mount, and route protection (+ full verify harness)

**Files:**

- Create: `backend/src/validators/auth.validators.ts`
- Create: `backend/src/controllers/auth.controllers.ts`
- Create: `backend/src/routes/auth.routes.ts`
- Modify: `backend/src/routes/index.ts`
- Modify: `backend/scripts/verify.ts` (full rewrite)

**Interfaces:**

- Consumes: auth service (Task 4), `signSession` + cookie helpers (Task 3), `requireAuth` (Task 5), `validate` + `asyncHandler` (existing).
- Produces endpoints: `POST /api/auth/google`, `GET /api/auth/me`, `PATCH /api/auth/me`, `POST /api/auth/logout`. `/api/events` and `/api/attendees` now require a session.

- [ ] **Step 1: Create the validators**

```ts
// backend/src/validators/auth.validators.ts
import { z } from 'zod';

export const googleAuthSchema = z.object({
  idToken: z.string().min(1),
});

export const updateMeSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
});
```

- [ ] **Step 2: Create the controllers**

```ts
// backend/src/controllers/auth.controllers.ts
import { Request, Response } from 'express';
import * as authService from '../services/auth.services';
import { signSession } from '../utils/jwt';
import { setSessionCookie, clearSessionCookie } from '../utils/authCookie';

export async function googleLogin(req: Request, res: Response) {
  const { idToken } = req.body as { idToken: string };
  let profile;
  try {
    profile = await authService.verifyGoogleIdToken(idToken);
  } catch {
    return res.status(401).json({ error: 'Invalid Google token' });
  }
  const { user, isNewUser } = await authService.upsertUserFromGoogle(profile);
  setSessionCookie(res, signSession(String(user._id)));
  res.json({ user: authService.toPublicUser(user), isNewUser });
}

export async function me(req: Request, res: Response) {
  res.json({ user: authService.toPublicUser(req.user!) });
}

export async function updateMe(req: Request, res: Response) {
  const { displayName } = req.body as { displayName: string };
  const user = await authService.updateDisplayName(String(req.user!._id), displayName);
  res.json({ user: authService.toPublicUser(user!) });
}

export async function logout(_req: Request, res: Response) {
  clearSessionCookie(res);
  res.status(204).end();
}
```

- [ ] **Step 3: Create the auth router**

```ts
// backend/src/routes/auth.routes.ts
import { Router } from 'express';
import * as controller from '../controllers/auth.controllers';
import { validate } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middlewares/requireAuth.middleware';
import { googleAuthSchema, updateMeSchema } from '../validators/auth.validators';

export const authRouter = Router();

authRouter.post('/google', validate(googleAuthSchema), asyncHandler(controller.googleLogin));
authRouter.get('/me', asyncHandler(requireAuth), asyncHandler(controller.me));
authRouter.patch(
  '/me',
  asyncHandler(requireAuth),
  validate(updateMeSchema),
  asyncHandler(controller.updateMe),
);
authRouter.post('/logout', asyncHandler(requireAuth), asyncHandler(controller.logout));
```

- [ ] **Step 4: Mount `/auth` and guard `/events` + `/attendees`**

Rewrite `backend/src/routes/index.ts` to:

```ts
import { Router } from 'express';
import mongoose from 'mongoose';
import { eventRouter } from './event.routes';
import { attendeeRouter } from './attendee.routes';
import { authRouter } from './auth.routes';
import { requireAuth } from '../middlewares/requireAuth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const apiRouter = Router();

// Readiness probe: 200 only when the DB is actually connected (readyState 1),
// so an orchestrator/load balancer won't route traffic to a DB-less instance.
apiRouter.get('/health', (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({ ok: dbConnected, db: dbConnected ? 'up' : 'down' });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/events', asyncHandler(requireAuth), eventRouter);
apiRouter.use('/attendees', asyncHandler(requireAuth), attendeeRouter);
```

- [ ] **Step 5: Rewrite the verify harness to authenticate and assert the auth flow**

Replace the entire contents of `backend/scripts/verify.ts` with:

```ts
/**
 * End-to-end verification against an ephemeral in-memory MongoDB.
 * Boots a real mongod, points the app at it, starts the HTTP server,
 * authenticates via the test-token bypass, and exercises every endpoint.
 *
 * Run: npx tsx scripts/verify.ts
 * This is a dev/demo aid — not part of the running service.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

let pass = 0;
let fail = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

async function main() {
  const mongo = await MongoMemoryServer.create();
  process.env.NODE_ENV = 'test'; // silences request logging, enables the auth test bypass
  process.env.MONGODB_URI = mongo.getUri('roadshow_badges');
  process.env.PORT = '4055';
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.JWT_SECRET = 'test-secret-at-least-16-chars-long';

  // Import AFTER env is set so config/env picks up the in-memory URI.
  const { createApp } = await import('../src/app');
  const { connectDb } = await import('../src/config/db');
  const mongoose = (await import('mongoose')).default;

  await connectDb();
  const app = createApp();
  const server = app.listen(4055);
  const base = 'http://localhost:4055/api';

  // --- cookie jar: capture Set-Cookie from login, replay it on later requests ---
  let sessionCookie = '';
  function captureCookie(res: Response) {
    const set = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const sess = set.find((c) => c.startsWith('session='));
    if (sess) sessionCookie = sess.split(';')[0];
  }
  function afetch(path: string, init: RequestInit = {}) {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (sessionCookie) headers.Cookie = sessionCookie;
    return fetch(`${base}${path}`, { ...init, headers });
  }
  const testToken = (p: { sub: string; email: string; name: string; picture: string }) =>
    'test|' + JSON.stringify(p);

  try {
    // health (public)
    const health = await fetch(`${base}/health`).then((r) => r.json());
    check('GET /health → {ok:true}', health.ok === true, health);

    // --- AUTH ---
    // guarded route without a session → 401
    const noAuth = await fetch(`${base}/events`);
    check('GET /events without session → 401', noAuth.status === 401, noAuth.status);

    // google login (stubbed via test bypass) → new user + cookie
    const profile = {
      sub: 'g-1',
      email: 'op@itcom.uz',
      name: 'Operator One',
      picture: 'http://img/1.png',
    };
    const loginRes = await fetch(`${base}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: testToken(profile) }),
    });
    captureCookie(loginRes);
    const login = await loginRes.json();
    check(
      'POST /auth/google → 200, isNewUser=true',
      loginRes.status === 200 && login.isNewUser === true,
      login,
    );
    check('login set a session cookie', sessionCookie.startsWith('session='), sessionCookie);
    check('new user onboardedAt is null', login.user.onboardedAt === null, login.user);

    // login again with same sub → existing user
    const login2 = await fetch(`${base}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: testToken(profile) }),
    }).then((r) => r.json());
    check('POST /auth/google again → isNewUser=false', login2.isNewUser === false, login2);

    // bad token → 401
    const badToken = await fetch(`${base}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'not-a-valid-token' }),
    });
    check('POST /auth/google bad token → 401', badToken.status === 401, badToken.status);

    // /auth/me with cookie
    const meBody = await afetch('/auth/me').then((r) => r.json());
    check('GET /auth/me → user email', meBody.user.email === 'op@itcom.uz', meBody);

    // /auth/me without cookie → 401
    const meNo = await fetch(`${base}/auth/me`);
    check('GET /auth/me without cookie → 401', meNo.status === 401, meNo.status);

    // confirm name (onboarding step)
    const patched = await afetch('/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Operator Uno' }),
    }).then((r) => r.json());
    check(
      'PATCH /auth/me → name updated + onboardedAt set',
      patched.user.displayName === 'Operator Uno' && patched.user.onboardedAt !== null,
      patched,
    );

    // --- EVENTS / ATTENDEES (now require the session cookie) ---
    const createRes = await afetch('/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Roadshow June',
        date: '2026-06-20',
        attendees: [
          { fullName: 'john smith', extra: { role: 'Speaker' } },
          { fullName: 'jane doe', extra: {} },
        ],
      }),
    });
    const created = await createRes.json();
    check('POST /events → 201', createRes.status === 201, createRes.status);
    check('POST /events → attendeeCount=2', created.attendeeCount === 2, created);
    const eventId = created._id;

    // empty attendees → 400
    const badRes = await afetch('/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X', date: '2026-01-01', attendees: [] }),
    });
    check('POST /events with no attendees → 400', badRes.status === 400, badRes.status);

    // list events → attendeeCount present
    const events = await afetch('/events').then((r) => r.json());
    check(
      'GET /events → array with attendeeCount=2',
      Array.isArray(events) && events[0]?.attendeeCount === 2,
      events,
    );

    // get one
    const one = await afetch(`/events/${eventId}`).then((r) => r.json());
    check('GET /events/:id → matching event', one._id === eventId, one);

    // unknown event → 404
    const missing = await afetch('/events/0123456789abcdef01234567');
    check('GET /events/:unknown → 404', missing.status === 404, missing.status);

    // malformed ObjectId → 400
    const badId = await afetch('/events/not-an-objectid');
    check('GET /events/:malformed → 400', badId.status === 400, badId.status);

    // unknown route → JSON 404
    const unknownRoute = await afetch('/nope');
    const unknownBody = await unknownRoute.json().catch(() => null);
    check(
      'GET /api/nope → JSON 404',
      unknownRoute.status === 404 && unknownBody?.error === 'NotFound',
      unknownBody,
    );

    // malformed JSON body → 400
    const badJson = await afetch('/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ this is not json',
    });
    check('POST /events with bad JSON → 400', badJson.status === 400, badJson.status);

    // search by name
    const searchJane = await afetch(`/events/${eventId}/attendees?search=jane`).then((r) =>
      r.json(),
    );
    check(
      'GET attendees?search=jane → only Jane',
      searchJane.length === 1 && searchJane[0].fullName === 'jane doe',
      searchJane,
    );

    // search hits denormalized extra (role=Speaker)
    const searchRole = await afetch(`/events/${eventId}/attendees?search=speaker`).then((r) =>
      r.json(),
    );
    check(
      'GET attendees?search=speaker → only John',
      searchRole.length === 1 && searchRole[0].fullName === 'john smith',
      searchRole,
    );

    // filter by status
    const notPrinted = await afetch(`/events/${eventId}/attendees?status=not_printed`).then((r) =>
      r.json(),
    );
    check('GET attendees?status=not_printed → both', notPrinted.length === 2, notPrinted);

    // invalid status → 400
    const badStatus = await afetch(`/events/${eventId}/attendees?status=bogus`);
    check('GET attendees?status=bogus → 400', badStatus.status === 400, badStatus.status);

    // print (first time)
    const janeId = searchJane[0]._id;
    const printed1 = await afetch(`/attendees/${janeId}/print`, { method: 'POST' }).then((r) =>
      r.json(),
    );
    check(
      'POST print → printStatus=printed, count=1',
      printed1.printStatus === 'printed' && printed1.printCount === 1,
      printed1,
    );
    check(
      'POST print → lastPrintedAt set',
      printed1.lastPrintedAt !== null,
      printed1.lastPrintedAt,
    );

    // reprint
    const printed2 = await afetch(`/attendees/${janeId}/print`, { method: 'POST' }).then((r) =>
      r.json(),
    );
    check('POST print again (reprint) → count=2', printed2.printCount === 2, printed2);

    // status filter reflects the print
    const printedList = await afetch(`/events/${eventId}/attendees?status=printed`).then((r) =>
      r.json(),
    );
    check(
      'GET attendees?status=printed → only Jane',
      printedList.length === 1 && printedList[0]._id === janeId,
      printedList,
    );

    // print unknown attendee → 404
    const printMissing = await afetch('/attendees/0123456789abcdef01234567/print', {
      method: 'POST',
    });
    check('POST print unknown attendee → 404', printMissing.status === 404, printMissing.status);

    // --- LOGOUT ---
    const logoutRes = await afetch('/auth/logout', { method: 'POST' });
    check('POST /auth/logout → 204', logoutRes.status === 204, logoutRes.status);
    sessionCookie = ''; // simulate the cleared cookie
    const afterLogout = await fetch(`${base}/auth/me`);
    check('GET /auth/me after logout → 401', afterLogout.status === 401, afterLogout.status);
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongo.stop();
  }

  console.log(`\n${fail === 0 ? 'ALL PASSED' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('verify crashed:', err);
  process.exit(1);
});
```

- [ ] **Step 6: Checkpoint — build + verify**

```bash
cd backend && npm run build && npm run verify
```

Expected: `ALL PASSED`. Every auth assertion and every (now-authenticated) event/attendee assertion passes.

- [ ] **Step 7 (optional): Commit**

```bash
git add backend/src/validators/auth.validators.ts backend/src/controllers/auth.controllers.ts backend/src/routes/auth.routes.ts backend/src/routes/index.ts backend/scripts/verify.ts
git commit -m "feat(auth): auth endpoints + guard events/attendees + verify coverage"
```

---

## Task 7: Stamp the author on events

**Files:**

- Modify: `backend/src/models/event.model.ts`
- Modify: `backend/src/services/event.services.ts:9-21`
- Modify: `backend/src/controllers/event.controllers.ts:4-7`
- Modify: `backend/scripts/verify.ts` (add one assertion)

**Interfaces:**

- Consumes: `req.user` (Task 5), `CreateEventInput` (existing).
- Produces: `createEventWithAttendees(input, author: { id: string; name: string; picture: string })`. Events now carry `authorId`, `authorName`, `authorPicture`.

- [ ] **Step 1: Add author fields to the Event model**

Rewrite `backend/src/models/event.model.ts`:

```ts
import { Schema, model, Document, Types } from 'mongoose';

export interface EventDoc extends Document {
  name: string;
  date: Date;
  authorId: Types.ObjectId;
  authorName: string;
  authorPicture: string;
  createdAt: Date;
}

const eventSchema = new Schema<EventDoc>({
  name: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  // Author identity is denormalized onto the event so the dashboard lists
  // events without a join (same reasoning as Attendee.searchText). A user
  // renaming themselves does not rewrite past events.
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  authorName: { type: String, default: '' },
  authorPicture: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

export const EventModel = model<EventDoc>('Event', eventSchema);
```

- [ ] **Step 2: Stamp the author in the service**

In `backend/src/services/event.services.ts`, change the `createEventWithAttendees` signature and the `EventModel.create` call:

```ts
export async function createEventWithAttendees(
  input: CreateEventInput,
  author: { id: string; name: string; picture: string },
) {
  const event = await EventModel.create({
    name: input.name,
    date: new Date(input.date),
    authorId: author.id,
    authorName: author.name,
    authorPicture: author.picture,
  });

  const docs = input.attendees.map((a) => ({
    eventId: event._id,
    fullName: a.fullName,
    extra: a.extra,
    searchText: buildSearchText(a.fullName, a.extra),
  }));
  await AttendeeModel.insertMany(docs);

  return { ...event.toObject(), attendeeCount: docs.length };
}
```

- [ ] **Step 3: Pass `req.user` from the controller**

In `backend/src/controllers/event.controllers.ts`, update `create`:

```ts
export async function create(req: Request, res: Response) {
  const user = req.user!; // guaranteed by requireAuth on the /events router
  const event = await eventService.createEventWithAttendees(req.body, {
    id: String(user._id),
    name: user.displayName,
    picture: user.picture,
  });
  res.status(201).json(event);
}
```

- [ ] **Step 4: Assert the author stamp in verify**

In `backend/scripts/verify.ts`, immediately after the `check('POST /events → attendeeCount=2', ...)` line, add:

```ts
check('POST /events → authorName stamped', created.authorName === 'Operator Uno', created);
```

(The harness confirms the name to "Operator Uno" before creating the event, so this matches.)

- [ ] **Step 5: Checkpoint — build + verify + smoke**

```bash
cd backend && npm run build && npm run verify && npm run smoke
```

Expected: `ALL PASSED` and `SMOKE PASSED`.

- [ ] **Step 6 (optional): Commit**

```bash
git add backend/src/models/event.model.ts backend/src/services/event.services.ts backend/src/controllers/event.controllers.ts backend/scripts/verify.ts
git commit -m "feat(auth): stamp author identity on created events"
```

---

## Task 8: Frontend — types, API client, auth hooks

**Files:**

- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/hooks/useAuth.ts`
- Modify: `frontend/package.json` (via npm)

**Interfaces:**

- Produces: `AuthUser` type; `api.googleLogin`, `api.me`, `api.updateMe`, `api.logout`; hooks `useAuth()`, `useGoogleLogin()`, `useUpdateName()`, `useLogout()`.

- [ ] **Step 1: Install react-router-dom**

```bash
cd frontend
npm install react-router-dom
```

- [ ] **Step 2: Add the `AuthUser` type and event author fields**

In `frontend/src/types.ts`, add at the top:

```ts
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  picture: string;
  onboardedAt: string | null;
}
```

And extend `AppEvent` with two optional fields:

```ts
export interface AppEvent {
  _id: string;
  name: string;
  date: string;
  createdAt: string;
  attendeeCount?: number;
  authorName?: string;
  authorPicture?: string;
}
```

- [ ] **Step 3: Send credentials and add auth methods to the API client**

In `frontend/src/lib/api.ts`, add `credentials: 'include'` to the shared `request` helper:

```ts
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}
```

Add an `AuthUser` import and these methods to the `api` object:

```ts
import type { AppEvent, Attendee, AuthUser, NewAttendee } from '../types';
```

```ts
  googleLogin: (idToken: string) =>
    request<{ user: AuthUser; isNewUser: boolean }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),

  // 401 means "no session" — return null instead of throwing, so the guard
  // can treat logged-out as a normal state rather than an error.
  me: async (): Promise<AuthUser | null> => {
    const res = await fetch(`${BASE}/auth/me`, { credentials: 'include' });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = (await res.json()) as { user: AuthUser };
    return data.user;
  },

  updateMe: (displayName: string) =>
    request<{ user: AuthUser }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    }),

  // logout returns 204 (no body), so don't route it through request().
  logout: async (): Promise<void> => {
    await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  },
```

- [ ] **Step 4: Create the auth hooks**

```ts
// frontend/src/hooks/useAuth.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AuthUser } from '../types';

/** The single source of truth for who's signed in. */
export function useAuth() {
  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: api.me,
    staleTime: Infinity, // identity doesn't change without an explicit mutation
  });
  return { user: data ?? null, isLoading };
}

export function useGoogleLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idToken: string) => api.googleLogin(idToken),
    onSuccess: (res) => qc.setQueryData<AuthUser>(['auth', 'me'], res.user),
  });
}

export function useUpdateName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => api.updateMe(displayName),
    onSuccess: (res) => qc.setQueryData<AuthUser>(['auth', 'me'], res.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      qc.setQueryData(['auth', 'me'], null);
      qc.removeQueries({ queryKey: ['events'] });
      qc.removeQueries({ queryKey: ['attendees'] });
    },
  });
}
```

- [ ] **Step 5: Checkpoint — build**

```bash
cd frontend && npm run build
```

Expected: `tsc -b && vite build` succeeds (unused exports are fine; types must check).

- [ ] **Step 6 (optional): Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/types.ts frontend/src/lib/api.ts frontend/src/hooks/useAuth.ts
git commit -m "feat(auth): frontend auth types, API client, hooks"
```

---

## Task 9: Frontend — Google script loader and the Login page

**Files:**

- Create: `frontend/src/lib/google.ts`
- Create: `frontend/src/types/google.d.ts`
- Create: `frontend/src/components/GoogleSignInButton.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/.env` (add `VITE_GOOGLE_CLIENT_ID`)

**Interfaces:**

- Consumes: `useGoogleLogin` (Task 8).
- Produces: `loadGoogleScript(): Promise<void>`, `<GoogleSignInButton />`, `<LoginPage />`.

- [ ] **Step 1: Add the client-id env var**

Add to `frontend/.env` (create the line; this is the Web client ID from Google Cloud):

```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

- [ ] **Step 2: Minimal typing for the GIS global**

```ts
// frontend/src/types/google.d.ts
interface GoogleCredentialResponse {
  credential: string; // the ID token (JWT)
}

interface GoogleIdConfig {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
}

interface GoogleButtonOptions {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'small' | 'medium' | 'large';
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  shape?: 'rectangular' | 'pill';
  width?: number;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: GoogleIdConfig) => void;
        renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
      };
    };
  };
}
```

- [ ] **Step 3: Script loader**

```ts
// frontend/src/lib/google.ts
let loaded: Promise<void> | null = null;

/** Loads the Google Identity Services script once and resolves when ready. */
export function loadGoogleScript(): Promise<void> {
  if (loaded) return loaded;
  loaded = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gsi]');
    if (existing) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.dataset.gsi = 'true';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google sign-in'));
    document.head.appendChild(s);
  });
  return loaded;
}
```

- [ ] **Step 4: The sign-in button component**

```tsx
// frontend/src/components/GoogleSignInButton.tsx
import { useEffect, useRef } from 'react';
import { loadGoogleScript } from '../lib/google';
import { useGoogleLogin } from '../hooks/useAuth';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

export function GoogleSignInButton() {
  const ref = useRef<HTMLDivElement>(null);
  const login = useGoogleLogin();

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript().then(() => {
      if (cancelled || !ref.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (resp) => login.mutate(resp.credential),
      });
      window.google.accounts.id.renderButton(ref.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
      });
    });
    return () => {
      cancelled = true;
    };
    // login.mutate identity is stable across renders (React Query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={ref} />
      {login.isError && <p className="text-sm text-amber">Sign-in failed. Please try again.</p>}
    </div>
  );
}
```

- [ ] **Step 5: The Login page**

```tsx
// frontend/src/pages/LoginPage.tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

export function LoginPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (user) return <Navigate to={user.onboardedAt ? '/app' : '/onboarding'} replace />;

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-ink px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[12px] bg-brand">
        <img src="/brand/itcomuz-icon-white.png" alt="ITCOMUZ" className="h-9 w-9 object-contain" />
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold tracking-[.04em] text-white">
        ROADSHOW BADGES
      </h1>
      <p className="mt-2 max-w-md text-sm text-faint">
        The badge-printing platform for IT Community of Uzbekistan events. Sign in to manage events
        and print attendee badges.
      </p>
      <div className="mt-8">
        <GoogleSignInButton />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Checkpoint — build**

```bash
cd frontend && npm run build
```

Expected: build succeeds.

- [ ] **Step 7 (optional): Commit**

```bash
git add frontend/src/lib/google.ts frontend/src/types/google.d.ts frontend/src/components/GoogleSignInButton.tsx frontend/src/pages/LoginPage.tsx
git commit -m "feat(auth): Google sign-in button and login page"
```

---

## Task 10: Frontend — guard, onboarding, router restructure

**Files:**

- Create: `frontend/src/components/RequireAuth.tsx`
- Create: `frontend/src/pages/OnboardingPage.tsx`
- Create: `frontend/src/pages/KioskPage.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**

- Consumes: `useAuth`, `useUpdateName` (Task 8); `LoginPage` (Task 9).
- Produces: `<RequireAuth>`, `<OnboardingPage>`, `<KioskPage>`, and the route table in `App.tsx`.

- [ ] **Step 1: The guard**

```tsx
// frontend/src/components/RequireAuth.tsx
import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface text-muted">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  // First-login users must confirm their name before using the app.
  if (!user.onboardedAt && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 2: The onboarding page**

```tsx
// frontend/src/pages/OnboardingPage.tsx
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth, useUpdateName } from '../hooks/useAuth';

export function OnboardingPage() {
  const { user, isLoading } = useAuth();
  const update = useUpdateName();
  const navigate = useNavigate();
  const [name, setName] = useState('');

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.onboardedAt) return <Navigate to="/app" replace />;

  // Pre-fill from the Google name the first time the field is empty.
  const value = name || user.displayName;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    update.mutate(trimmed, { onSuccess: () => navigate('/app', { replace: true }) });
  };

  return (
    <div className="flex h-screen items-center justify-center bg-surface px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-line bg-white p-8"
      >
        <h1 className="font-display text-xl font-bold text-ink">Welcome 👋</h1>
        <p className="mt-1.5 text-sm text-muted">
          Confirm the name we should show as the event author.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setName(e.target.value)}
          className="mt-5 w-full rounded-lg border border-line px-3 py-2.5 text-ink outline-none focus:border-brand"
          placeholder="Your name"
        />
        <button
          type="submit"
          disabled={update.isPending || !value.trim()}
          className="mt-4 w-full rounded-lg bg-brand py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Move the current app body into KioskPage**

Create `frontend/src/pages/KioskPage.tsx` with the current contents of `App.tsx`, renamed. Copy the body of the existing `App` function verbatim, changing only the import paths (one level deeper: `../components/...`, `../hooks/...`) and the export name:

```tsx
// frontend/src/pages/KioskPage.tsx
import { lazy, Suspense, useState } from 'react';
import { Header } from '../components/Header';
import { EventBar } from '../components/EventBar';
import { AttendeeTable } from '../components/AttendeeTable';
import { BadgePreviewTray } from '../components/BadgePreviewTray';
import { Toast } from '../components/Toast';
import { useEvents } from '../hooks/useEvents';

// Lazy so the ~500KB xlsx parser only loads when an operator opens Import.
const ImportDialog = lazy(() =>
  import('../components/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);

export function KioskPage() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const { data: events = [] } = useEvents();

  const activeEventId = eventId ?? events[0]?._id ?? null;
  const selectedEvent = events.find((e) => e._id === activeEventId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-ink">
      <Header />
      <EventBar eventId={activeEventId} onChange={setEventId} onImport={() => setImporting(true)} />

      <div className="flex-1 overflow-y-auto px-6 pb-7 pt-5">
        <div className="mx-auto max-w-[1120px]">
          {activeEventId ? (
            <AttendeeTable
              key={activeEventId}
              eventId={activeEventId}
              eventName={selectedEvent?.name}
            />
          ) : (
            <div className="rounded-2xl border border-line bg-white px-6 py-20 text-center">
              <div className="font-display text-[17px] font-bold text-ink-3">No event selected</div>
              <div className="mt-1.5 text-sm text-muted">
                Import a spreadsheet to create your first event.
              </div>
            </div>
          )}
        </div>
      </div>

      <BadgePreviewTray />

      {importing && (
        <Suspense fallback={null}>
          <ImportDialog onClose={() => setImporting(false)} />
        </Suspense>
      )}
      <Toast />
    </div>
  );
}
```

- [ ] **Step 4: Turn App.tsx into the router shell**

Replace the entire contents of `frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { KioskPage } from './pages/KioskPage';
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
        <Route
          path="/app/*"
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

- [ ] **Step 5: Checkpoint — build + lint**

```bash
cd frontend && npm run build && npm run lint
```

Expected: build and lint pass.

- [ ] **Step 6 (optional): Commit**

```bash
git add frontend/src/components/RequireAuth.tsx frontend/src/pages/OnboardingPage.tsx frontend/src/pages/KioskPage.tsx frontend/src/App.tsx
git commit -m "feat(auth): routing, RequireAuth guard, onboarding page"
```

---

## Task 11: Frontend — user menu and logout in the header

**Files:**

- Create: `frontend/src/components/UserMenu.tsx`
- Modify: `frontend/src/components/Header.tsx:53`

**Interfaces:**

- Consumes: `useAuth`, `useLogout` (Task 8).
- Produces: `<UserMenu />` mounted in the header next to `<PrinterStatus />`.

- [ ] **Step 1: The user menu**

```tsx
// frontend/src/components/UserMenu.tsx
import { useAuth, useLogout } from '../hooks/useAuth';

export function UserMenu() {
  const { user } = useAuth();
  const logout = useLogout();
  if (!user) return null;

  return (
    <div className="relative flex items-center gap-3">
      {user.picture ? (
        <img
          src={user.picture}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
          {user.displayName.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="hidden text-sm font-medium text-white sm:inline">{user.displayName}</span>
      <button
        onClick={() => logout.mutate()}
        className="rounded-md border border-white/20 px-2.5 py-1 text-xs font-medium text-faint hover:text-white"
      >
        Sign out
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Mount it in the header**

In `frontend/src/components/Header.tsx`, import the menu and place it alongside `PrinterStatus`. Change the imports and the trailing `<PrinterStatus />`:

```tsx
import { PrinterStatus } from './PrinterStatus';
import { UserMenu } from './UserMenu';
```

Replace the line `      <PrinterStatus />` (near the end of the header) with:

```tsx
<div className="relative flex items-center gap-5">
  <PrinterStatus />
  <UserMenu />
</div>
```

- [ ] **Step 3: Checkpoint — build + lint**

```bash
cd frontend && npm run build && npm run lint
```

Expected: build and lint pass.

- [ ] **Step 4 (optional): Commit**

```bash
git add frontend/src/components/UserMenu.tsx frontend/src/components/Header.tsx
git commit -m "feat(auth): user chip and sign-out in the header"
```

---

## Task 12: Docs + end-to-end manual verification

**Files:**

- Modify: `CLAUDE.md`
- Modify: `backend/CLAUDE.md`

**Interfaces:** none (documentation + manual gate).

- [ ] **Step 1: Update the root `CLAUDE.md`**

Under "Data flow" (or a new "Auth" subsection in Architecture), add a short note:

```markdown
### Auth (self-hosted Google)

Sign-in is Google Identity Services on the frontend → ID token → `POST /api/auth/google`, which the backend verifies with `google-auth-library`, upserts a `User`, and returns a signed-JWT session in an httpOnly cookie (`session`). The frontend reads `GET /api/auth/me` via the `['auth','me']` React Query key; `<RequireAuth>` gates `/app` and `/onboarding`, redirecting logged-out users to `/login` and unconfirmed-name users to `/onboarding`. `/events` and `/attendees` require the session; events are stamped with the author's denormalized `authorName`/`authorPicture`. Sign-in is open to any Google account today — the guard and `verifyGoogleIdToken` are structured so a domain/allowlist restriction is a small later change.
```

- [ ] **Step 2: Update `backend/CLAUDE.md`**

Add `/auth/google`, `/auth/me` (GET/PATCH), `/auth/logout` to the API surface table, and note the new env vars `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `COOKIE_DOMAIN` plus the `requireAuth` guard on `/events` and `/attendees`.

- [ ] **Step 3: Full backend verification**

```bash
cd backend && npm run build && npm run verify && npm run smoke
```

Expected: `ALL PASSED` and `SMOKE PASSED`.

- [ ] **Step 4: Manual end-to-end (requires a real Google OAuth Client ID configured)**

Prerequisite: create a **Google Cloud → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application)**. Add authorized JavaScript origins: `http://localhost:5173` (dev) and your prod frontend origin. Put the client id in `frontend/.env` (`VITE_GOOGLE_CLIENT_ID`) and `backend/.env` (`GOOGLE_CLIENT_ID`), and set a real `JWT_SECRET` in `backend/.env`.

Then, with MongoDB running:

```bash
# terminal 1
cd backend && npm run dev
# terminal 2
cd frontend && npm run dev
```

Walk the flow in the browser and confirm each:

- Visiting `http://localhost:5173/app` while logged out redirects to `/login`.
- The Google button renders; signing in lands a **new** account on `/onboarding` with the name pre-filled.
- Confirming the name lands on `/app` (the kiosk) and the header shows your name + picture.
- Reloading `/app` stays on `/app` (session persists via the cookie).
- Importing a spreadsheet creates an event; signing in as the same user shows it. (Author is stamped server-side.)
- "Sign out" returns to `/login`; `/app` is guarded again.

- [ ] **Step 5 (optional): Commit**

```bash
git add CLAUDE.md backend/CLAUDE.md
git commit -m "docs(auth): document auth flow, endpoints, and env vars"
```

---

## Self-Review Notes (already reconciled)

- **Spec coverage:** User model (T2) · Google verify + test bypass (T4) · session cookie/JWT (T3) · endpoints (T6) · guard (T5/T6) · onboarding name step (T6 backend, T10 frontend) · event author denormalized (T7) · routing (T10) · React Query `['auth','me']` (T8) · cross-origin cookie config (T3) · verify.ts coverage (T6/T7) · env fail-fast (T1) · Google Cloud prerequisite (T12). All spec sections map to a task.
- **Type consistency:** `GoogleProfile`, `SessionPayload`, `AuthUser`, `toPublicUser` shape (`id/email/displayName/picture/onboardedAt`), cookie name `session`, query key `['auth','me']`, and test-token prefix `test|` are used identically across tasks.
- **Ordering safety:** required env vars are seeded into `verify.ts` (T1) and `smoke.ts` (T1) the moment they become required, so every intermediate checkpoint stays green. Route protection (T6) and the author stamp (T7) update the harness in the same task that introduces the behavior.

```

```
