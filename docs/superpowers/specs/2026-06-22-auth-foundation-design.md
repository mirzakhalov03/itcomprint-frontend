# Auth Foundation — Design Spec

**Date:** 2026-06-22
**Status:** Approved for planning
**Slice:** 1 of the platform expansion (Auth → Landing/Dashboard → Printing features)

---

## Context

Roadshow Badge Printing is becoming a real platform. The agreed build order is **Auth first** (the backbone), then the public landing page + events dashboard, then printing-process features. This spec covers **only the auth foundation**: Google sign-in, a self-hosted session, a first-login name-confirm step, a guard that puts the existing kiosk behind login, and an author stamp on events.

The marketing landing page and the real dashboard UI are explicitly **out of scope** for this slice and get their own spec/plan/implementation cycle.

### Decisions locked during brainstorming

- **Self-hosted Google auth** (not Clerk/Firebase). Google Identity Services on the frontend produces an ID token; the Express backend verifies it, upserts a `User` in Mongo, and issues its own session. Keeps identity in our own database and matches the hand-rolled ethos of the codebase.
- **Open sign-in:** anyone with a Google account may sign in. The `User` model and guard are designed so a domain/allowlist restriction is a small later change, not a rewrite.
- **Name step = confirm/edit on first login**, pre-filled from the Google name, editable later in profile. Google's name/email/picture are trusted as defaults but the display name is user-confirmed once.

---

## Scope

**In scope**

- Google sign-in → self-hosted session (JWT in httpOnly cookie)
- First-login name-confirm step
- `RequireAuth` guard wrapping the existing kiosk app
- Client-side routing (new to the frontend)
- `User` model; `authorId` + denormalized `authorName`/`authorPicture` on events
- `verify.ts` coverage for the new endpoints and guard

**Out of scope (later slices)**

- Public marketing landing page
- Real events dashboard UI (after login, users land on the **existing kiosk** for now)
- Multi-provider auth, roles/permissions, domain/allowlist enforcement
- Any printing-process changes

---

## User flow

```
Visitor → /login ──(Google)──▶ verify ──▶ first time? ──▶ /onboarding (confirm name)
                                              │ returning           │
                                              ▼                     ▼
                                          /app  ◀───────────────────┘
                                       (existing kiosk, now guarded)
```

---

## Backend design

### User model — `models/user.model.ts`

| Field         | Type         | Notes                                                                                                                                                                                         |
| ------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `googleId`    | string       | Google `sub`, unique index                                                                                                                                                                    |
| `email`       | string       | from Google                                                                                                                                                                                   |
| `displayName` | string       | user-confirmed name (defaults to Google name)                                                                                                                                                 |
| `googleName`  | string       | original Google name, retained                                                                                                                                                                |
| `picture`     | string       | Google profile picture URL                                                                                                                                                                    |
| `onboardedAt` | Date \| null | set when the user confirms their name; `null` until then. The guard reads this to decide onboarding, so the redirect survives a page refresh — `isNewUser` alone (a login-moment flag) can't. |
| `createdAt`   | Date         |                                                                                                                                                                                               |
| `lastLoginAt` | Date         | bumped on each sign-in                                                                                                                                                                        |

### Auth service — `services/auth.services.ts`

Two bounded functions:

- `verifyGoogleIdToken(idToken): Promise<GoogleProfile>` — wraps `google-auth-library` `OAuth2Client.verifyIdToken`, asserts `audience === GOOGLE_CLIENT_ID`, returns `{ sub, email, name, picture }`. **Isolated specifically so `verify.ts` can stub it**, since the test harness cannot mint real Google tokens. A later domain/allowlist check lives here.
- `upsertUserFromGoogle(profile): Promise<{ user, isNewUser }>` — find-or-create by `googleId`, set `lastLoginAt`, return the user and whether it was newly created.

### Session — JWT in httpOnly cookie

- Stateless signed JWT (`utils/jwt.ts`): `sign({ uid })` and `verify(token)`. No session collection.
- Cookie attributes: `httpOnly: true`; `secure: true` + `sameSite: 'none'` in production (frontend and API are different origins); `sameSite: 'lax'` in dev. Optional `domain` from `COOKIE_DOMAIN`. Sensible expiry (e.g. 30 days).
- `cookie-parser` middleware added in `app.ts`; CORS gets `credentials: true`.

### Endpoints — `routes/auth.routes.ts`, mounted at `/api/auth`

| Method | Path           | Behaviour                                                                                                                                    |
| ------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/google` | body `{ idToken }` → verify → upsert → set cookie → `200 { user, isNewUser }`                                                                |
| GET    | `/auth/me`     | read cookie → `200 { user }`, or `401` if no/invalid session                                                                                 |
| PATCH  | `/auth/me`     | body `{ displayName }` → update display name and set `onboardedAt` if unset (name-confirm step **and** later profile edits) → `200 { user }` |
| POST   | `/auth/logout` | clear cookie → `204`                                                                                                                         |

Routes follow the existing convention: `validate(schema, part)` then `asyncHandler(controller)`. Controllers stay thin; logic lives in the service. Zod schemas in `validators/auth.validators.ts`.

### Guard — `middlewares/requireAuth.middleware.ts`

Reads the session cookie → verifies JWT → loads the user → attaches `req.user`; otherwise responds `401`. Applied to the `/events` and `/attendees` routers. Only `/health` and `POST /auth/google` remain public. `GET/PATCH /auth/me` and `/auth/logout` require the cookie.

### Events get an author

- Add to the Event model: `authorId` (ref `User`), denormalized `authorName`, `authorPicture`. Denormalized so the future dashboard lists events with no join — the same reasoning behind the existing `searchText` denormalization. Trade-off: renaming a user does not rewrite past events' `authorName`; acceptable and consistent with current patterns.
- `createEventWithAttendees` reads `req.user` (via controller) and stamps `authorId`/`authorName`/`authorPicture`.

### Env additions — `config/env.ts` (Zod, fail-fast)

- `GOOGLE_CLIENT_ID` (required) — OAuth client id, also the token audience.
- `JWT_SECRET` (required, min length) — session signing secret.
- `COOKIE_DOMAIN` (optional) — for cross-subdomain cookies in prod.
- Update `.env.example`.

---

## Frontend design

### Routing (new)

Introduce `react-router-dom`. `App.tsx` is currently `useState`-driven with no URLs; auth requires real routes.

- `/login` — public; Google sign-in button.
- `/onboarding` — authed, first-login only; display-name field pre-filled from Google, editable.
- `/app/*` — authed; the current kiosk, wrapped in `<RequireAuth>`.
- `<RequireAuth>` — redirects unauthenticated users to `/login`, and authenticated users whose `onboardedAt` is `null` to `/onboarding`. Reading the persisted `onboardedAt` (not the login-moment `isNewUser`) makes the redirect correct across page refreshes.

### Auth flow

- Google Identity Services script renders the sign-in button and returns an ID token.
- ID token → `POST /auth/google`; response cached by React Query under `['auth','me']`.
- `useAuth()` hook exposes `user`, `login`, `logout`, loading state. The guard, header, and event-author stamping all read from this single query — **auth is server state, so it lives in React Query, not Zustand.** Zustand remains for genuinely client-only state (printer, toast, preview).
- `lib/api.ts` request helper switches to `credentials: 'include'` so the session cookie is sent.

### Env

- `VITE_GOOGLE_CLIENT_ID`.

---

## Testing — `scripts/verify.ts`

The harness cannot use real Google tokens, so `verifyGoogleIdToken` is stubbed/injected in the test boot. New assertions:

- Unauthenticated request to a guarded route → `401`.
- Stubbed Google login → sets cookie, returns `{ user, isNewUser: true }` on first call, `isNewUser: false` on second.
- `GET /auth/me` with cookie → user; without cookie → `401`.
- `PATCH /auth/me { displayName }` → updated name and `onboardedAt` set.
- `POST /auth/logout` → clears cookie; subsequent `/auth/me` → `401`.
- `POST /events` while authed → event stamped with `authorId`/`authorName`.

Run `npm run verify` after backend changes (and `npm run smoke` before deploy), per existing policy. No unit tests added.

---

## Prerequisite (manual, owner-only)

Create a **Google Cloud OAuth 2.0 Client ID** (Web application) and add dev + prod origins to its authorized JavaScript origins. Exact steps provided at implementation time. This is a console task only the project owner can perform; the client id goes into `GOOGLE_CLIENT_ID` (backend) and `VITE_GOOGLE_CLIENT_ID` (frontend).

---

## Risks

- **Cross-origin cookies** are the fiddliest part: `SameSite=None; Secure`, CORS `credentials: true`, and `fetch` `credentials: 'include'` must all align, or the session silently fails to persist on the deployed (different-origin) setup. Likely to need a debug pass on first real deploy.
- **Open sign-in:** anyone with a Google account can enter and see/print all events. Accepted for now; the guard and `verifyGoogleIdToken` are structured so a domain/allowlist restriction is a small, localized change.

---

## New dependencies

- Backend: `google-auth-library`, `jsonwebtoken` (+ `@types/jsonwebtoken`), `cookie-parser` (+ `@types/cookie-parser`).
- Frontend: `react-router-dom`. (Google Identity Services loads via script tag, no npm package.)
