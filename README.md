# EasyDel — Delivery Agent Route Management Platform

A route management platform for recurring delivery work (newspapers, milk, food
subscriptions, parcels). Built on an **open, free-first mapping stack** —
OpenStreetMap + MapLibre + OSRM — with Google Maps / Waze / Apple Maps used only
as optional turn-by-turn handoff, never as the core routing engine.

---

## Project status

Verified state as of **07 Sep 2026** — every claim here was checked by running
the command, not assumed.

| Component | Status | Detail |
|---|---|---|
| `apps/web` | ✅ **Working** | The whole product: auth, recording, routing, delivery runs |
| Supabase Postgres | ✅ Migrated | 6 migrations, 17 models |
| Supabase Storage | ✅ Working | Private bucket, signed URLs for checkpoint photos |
| Route optimiser | ✅ Working | Nearest-neighbour + 2-opt, OSRM for road distances |
| Auth | ✅ Working | Self-hosted: scrypt passwords, email OTP, password reset |
| `apps/api` (NestJS) | ❌ Does not compile | 30 TypeScript errors. **Not used** — the web app talks to Postgres directly |
| `apps/mobile` | ❌ Skeleton | 3 of 16 screens, no build pipeline |
| `packages/ui`, `packages/validation` | ❌ Empty | `package.json` only |

**Tests:** 91 unit + integration passing. The Playwright suite still references
the removed demo accounts and needs rewriting.

### What works end to end

Each of these was driven start to finish in a browser, not just built:

- **Sign up → email OTP → sign in → password reset.** Passwords are scrypt-hashed
  locally; codes and reset tokens are stored hashed, expire, and are single-use.
- **Day one: record a round by driving it.** Live map, GPS trail, a checkpoint
  per house with photo, package type, quantity, notes and a note for next visit.
- **Day two: run the route.** Navigation map with the road path from OSRM,
  north-up/heading-up toggle, mark delivered, skip or fail with a reason, report
  a problem, geofence warning, cancel the run.
- **The photo taken on day one appears on the stop card on day two**, served
  through a short-lived signed URL.
- **Build a route from pasted map links.** Google, Apple, Waze, or plain
  coordinates. Preview on a map, then create a round trip or add to an existing
  route.
- **Edit routes.** Add stops by link or from a saved checkpoint, remove stops,
  re-optimise. Every change writes a new version; history never changes
  retroactively.

### Architectural note

The web app talks to **Postgres directly** via Server Components and Server
Actions. It does not go through the NestJS API. That was a deliberate call: it
made the product work without first fixing the API's 30 compile errors. The API
remains in the repo as the intended mobile backend.

### Not built yet

Offline queue and sync, proof-of-delivery photos, address geocoding, recurring
route templates, and the mobile app.

---

## Architecture

```
EasyDel/                        pnpm workspace + turborepo
├── apps/
│   ├── api/                    NestJS 12 (ESM, nodenext) — REST API
│   ├── web/                    Next.js 16 (App Router) — admin dashboard
│   └── mobile/                 Expo / React Native — delivery agent app
└── packages/
    ├── database/               Prisma schema + shared PrismaClient
    ├── routing/                RoutingProvider interface + OSRMRoutingProvider
    ├── types/                  Shared TypeScript types
    ├── ui/                     (empty — planned shared components)
    └── validation/             (empty — planned shared Zod/DTO schemas)
```

### Mapping stack (deliberately Google-free)

| Concern | Implementation | Swappable via |
|---|---|---|
| Geo data | OpenStreetMap | — |
| Rendering | MapLibre GL | `MAP_STYLE_URL` |
| Routing / optimization | OSRM (`/trip` service) | `RoutingProvider` interface |
| Geocoding | Nominatim | `GEOCODING_URL` |
| Turn-by-turn | Optional handoff to Google/Waze/Apple | user choice |

Routing is abstracted behind `RoutingProvider` in `packages/routing/src/index.ts`,
so Valhalla or a commercial provider can be added without touching UI code.

> **Production note:** the default `OSRM_URL` points at the public demo server
> `router.project-osrm.org`, and `GEOCODING_URL` at public Nominatim. **Both have
> strict usage policies and must not be used for production traffic.** Self-host
> before going live (see [Self-hosting](#self-hosting-routing--geocoding)).

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 (22.x tested) | |
| pnpm | 11.21.0 | `packageManager` is pinned — use pnpm, **not npm** |
| PostgreSQL | 15+ | Or a Supabase project (recommended) |
| Java | 17 | Only for local Android builds |
| Android SDK | — | Only for local APK builds; EAS cloud build avoids this |

This is a **pnpm workspace**. Running `npm install` in a subdirectory will create
a competing lockfile and break resolution. Always install from the repo root.

---

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Then fill in `.env`. Every variable is documented in `.env.example`.

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | **web**, API, migrations | Supabase **pooled** connection (port 6543) |
| `DIRECT_URL` | migrations | Supabase **direct** connection (port 5432) — Prisma needs this for DDL |
| `SUPABASE_URL` | API | |
| `SUPABASE_ANON_KEY` | API, mobile | Safe to expose to clients |
| `SUPABASE_SERVICE_ROLE_KEY` | API **only** | 🔴 **Never expose to any frontend bundle** |
| `JWT_SECRET` | API, web | Signs the dashboard session cookie |
| `ADMIN_PASSWORD` | seed only | Password given to the seeded demo accounts. Not used for auth at runtime |
| `SMTP_HOST` … `SMTP_FROM` | web | Outbound email. Blank = codes printed to server console |
| `ROUTING_PROVIDER` | API | `OSRM` \| `VALHALLA` |
| `OSRM_URL` | API | Self-host for production |
| `GEOCODING_URL` | API | Self-host for production |
| `MAP_STYLE_URL` | mobile | MapLibre style JSON |
| `NEXT_PUBLIC_MAP_STYLE_URL` | web | MapLibre style JSON for the browser |
| `NEXT_PUBLIC_API_URL` | web | |
| `EXPO_PUBLIC_API_URL` | mobile | Must be a LAN IP, not `localhost`, for a physical phone |
| `STORAGE_BUCKET` | API | Supabase Storage bucket for photos |

`.env` is gitignored. Never commit it.

**The web app reads its own `apps/web/.env.local`**, not the root `.env`. At
minimum it needs `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` and
`ADMIN_PASSWORD`; `OSRM_URL` is optional (the optimiser falls back to
straight-line distance without it).

### 3. Generate the Prisma client

```bash
pnpm --filter @delivery/database db:generate
```

### 4. Apply the database schema

Two migrations exist (`init` and `add_setting`). Applying them creates all 14
tables. **Confirm you are pointed at a development database first** — this
writes DDL:

```bash
pnpm --filter @delivery/database db:deploy    # apply existing migrations
```

Use `db:migrate` only when you have *changed* `schema.prisma` and need a new
migration generated:

```bash
pnpm --filter @delivery/database db:migrate --name your_change
```

### 4b. Email (optional for local development)

Auth is self-hosted — Supabase is not in the authentication path, and there is
nothing to configure in its dashboard.

**With no SMTP configured**, verification codes are printed to the server
console instead of being emailed, and the UI says so. Signup works fully
locally without a mail server.

**For real delivery**, set `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`
in `apps/web/.env.local`. See **[docs/email-and-auth.md](./docs/email-and-auth.md)**
for provider settings and the full flow.

The seeded demo accounts are pre-verified, so you can sign in and use the
dashboard before touching email at all.

### 5. Seed demo data

```bash
pnpm --filter @delivery/database db:seed
```

Idempotent — safe to re-run. Creates 4 users, 10 locations (including a PAUSED
and a CANCELLED one so lifecycle filtering is visible), 13 subscriptions, an
optimised 8-stop route, a training session with checkpoints, a GPS track, 3
issues and audit-log entries.

> **⚠️ Do not seed a database that is in use.** The demo accounts share one
> password (`ADMIN_PASSWORD`), and seeding resurrects demo locations and routes
> that may have been deliberately removed. The script refuses to run when
> `NODE_ENV=production` or on Vercel; override with `ALLOW_SEED=yes` only if you
> are certain.

Demo accounts created by the seed (all share `ADMIN_PASSWORD`):

| Email | Role |
|---|---|
| `admin@easydel.dev` | ADMIN |
| `mentor@easydel.dev` | MENTOR |
| `driver@easydel.dev` | DELIVERY_AGENT |

---

## Running locally

```bash
# Web dashboard  → http://localhost:3000
pnpm --filter web dev

# API            → http://localhost:3001   (⚠️ currently fails to compile)
pnpm --filter api start:dev

# Mobile (Expo)
pnpm --filter mobile start
```

Or everything at once via turborepo:

```bash
pnpm dev
```

### Verification commands

```bash
pnpm check:env                             # ✅ every variable, and the service behind it
pnpm --filter web test                     # ✅ 91 unit + integration tests
pnpm --filter web build                    # ✅ passes
pnpm --filter @delivery/database typecheck # ✅ passes
pnpm --filter api test                     # ❌ 5 of 9 files fail — known, see TODO
```

`pnpm check:env` connects to the database, SMTP server and Supabase Storage and
reports which one is misconfigured. It never prints a secret. Run it before
deploying — see [DEPLOY.md](./DEPLOY.md).

The Playwright suite currently targets the removed demo accounts and needs
rewriting before it will pass.

---

## Deploying

The dashboard is a fully static Next.js build and references **no environment
variables**, so it deploys with zero configuration.

See [DEPLOY.md](./DEPLOY.md) for the step-by-step walkthrough.

> **Before deploying publicly**, note that `/download-app` currently advertises
> "v1.0.0 (Production), 45.2 MB" with a **non-functional download button** —
> no APK exists. Remove or gate that page so it does not mislead drivers.

---

## Self-hosting routing / geocoding

The public OSRM and Nominatim servers are rate-limited and **prohibited for
production use**. Self-host both before launch.

**OSRM** (example, India extract):

```bash
wget https://download.geofabrik.de/asia/india-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/india-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/india-latest.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/india-latest.osrm
docker run -p 5000:5000 -v "${PWD}:/data" osrm/osrm-backend \
  osrm-routed --algorithm mld /data/india-latest.osrm
# then: OSRM_URL="http://localhost:5000"
```

**Nominatim:** use the `mediagis/nominatim` Docker image with the same extract,
then set `GEOCODING_URL`.

---

## TODO

Ordered by dependency — earlier items unblock later ones.

### 🔴 Security — before this is more than an internal tool

- [ ] **Replace the shared `ADMIN_PASSWORD` with per-user auth** (Supabase Auth).
      One shared password cannot distinguish ADMIN from MENTOR from
      DELIVERY_AGENT, so `requireAdmin()` currently gates on the role of
      whichever user row matches the submitted email. Acceptable for a handful
      of trusted admins; not acceptable beyond that.
- [ ] Rate-limit the login action (no attempt throttling today)
- [ ] Self-host OSRM and Nominatim — the public demo servers prohibit
      production use

### 🟠 API (`apps/api`) — needed before the mobile app can work

The web dashboard does not use the API, so these no longer block the website.
They **do** block mobile, which cannot query Postgres directly.

- [ ] **Fix 30 TypeScript errors** (~1–2 h, mostly mechanical)
  - [ ] 14 × `TS2307`: add `.js` extensions to relative imports. The API is
        `"type": "module"` + `nodenext`, so `'../prisma/prisma.service'` must be
        `'../prisma/prisma.service.js'`
  - [ ] 2 × `TS2724`: `apps/api/src/auth/auth.module.ts` imports
        `SupabaseStrategyService`, but the file exports `SupabaseStrategy`
  - [ ] 9 × `TS7006` implicit `any` — mostly cascade from the above
  - [ ] 2 × `TS7006` in `packages/routing/src/index.ts:54` — type the OSRM
        `waypoints` response instead of `any`
  - [ ] 1 × `TS2307` `supertest/types`, 1 × `TS2554` in `roles.guard`
- [ ] **Fix 5 failing test files** — Nest DI wiring: specs instantiate services
      without providing `PrismaService` to the testing module
- [ ] **Reconcile the duplication** between `apps/web/src/lib/actions.ts` and
      the API. The optimiser, validation and audit logic currently live only in
      the web app; extract into `packages/` so both consume one implementation
- [ ] `POST /auth/login`

### 🟠 Web dashboard — remaining gaps

Core flows work. What is still missing:

- [ ] **Address geocoding** — locations require manual lat/lng, and CSV rows
      without coordinates are rejected rather than geocoded. Needs a
      `GeocodingProvider` + a result cache so the same address is never
      geocoded twice
- [ ] **.xlsx / .xls import** — only CSV parses today; needs a spreadsheet
      parser dependency
- [ ] Map-link parsing (Google/Apple/Waze URLs → coordinates)
- [ ] Edit and move an existing location from the UI — `moveLocationAction`
      exists and writes `LocationHistory`, but no page calls it yet
- [ ] Subscription management UI (create/pause/cancel individual customers)
- [ ] Location history viewer (`LocationHistory` rows are written, never shown)
- [ ] Manual stop reordering and add/remove stops on an existing route
- [ ] Route templates and recurring-route generation
- [ ] Training checkpoint photos (needs Supabase Storage upload)
- [ ] Auto-resume `PAUSED` locations once `pauseUntil` passes — the field is
      stored and displayed, but nothing sweeps it yet
- [ ] Average delivery time per stop (needs per-stop timestamps from mobile)

### 🟠 API endpoints still to build

`sync`, `tracking` and `users` are 4-line empty shells (`@Module({})`).
7 domain endpoints exist against ~20 in the spec.

- [ ] `POST /routes/optimize` as a standalone endpoint
- [ ] `POST /routes/:id/start` · `/end` · `/stops/:stopId/deliver` · `/issue`
- [ ] `POST /training/start` · `/:id/checkpoints` · `/:id/end`
- [ ] `POST /tracking/location` · `GET /tracking/drivers`
- [ ] `POST /locations/import`
- [ ] `GET /reports`
- [ ] Rate limiting, Helmet, CORS allowlist
- [ ] Serve agent permissions from the `Setting` table to the mobile app

### 🔵 Mobile app — see [Mobile roadmap](#mobile-roadmap)

### ⚪ Testing

- [ ] **Rewrite the Playwright suite.** `apps/web/tests/ui.spec.ts` still signs
      in as `admin@easydel.dev` and asserts against seeded locations, all of
      which were deliberately deleted. It needs to create its own fixture user
      and data, then tear them down — depending on seed data was the mistake.
      The 91 unit and integration tests are unaffected.
- [ ] Add e2e coverage for the flows added since: recording, delivery runs,
      link import, route editing.

### ⚪ Project hygiene

- [ ] Populate `packages/ui` and `packages/validation` (currently empty)
- [ ] Expand `packages/types` (currently 1 line)
- [ ] Docker Compose for local Postgres + OSRM + Nominatim
- [ ] CI pipeline (typecheck, lint, test)
- [ ] Missing Prisma models: `Customer`, `RouteTemplate`, `DeliveryProof`,
      `ImportedFile`, `Notification`, `SyncOperation`

---

## Mobile roadmap

**Current state:** 3 of 16 specced screens. `RouteMapScreen.tsx:9` renders the
literal text `"MapLibre Native View"` because no map library is installed.
There is no `eas.json`, so no build can be produced.

Estimated **6–10 weeks**. Ordered by dependency:

### Phase 1 — Make it buildable (~2 days)

- [ ] Add `eas.json` with a `preview` profile producing an **APK**
      (`"buildType": "apk"` — the default `production` profile emits an AAB,
      which cannot be sideloaded)
- [ ] Install missing native deps:
  - `@maplibre/maplibre-react-native` — map rendering
  - `expo-camera` — building & proof-of-delivery photos
  - `expo-notifications` — route assignment alerts
  - `expo-task-manager` — **required** for background GPS
  - `@react-native-community/netinfo` — offline detection
- [ ] Configure `app.json`: currently lists only the `expo-sqlite` plugin. Needs
      location plugins, `ACCESS_BACKGROUND_LOCATION`, camera permissions, and
      real `name`/`slug` (both are literally `"mobile"`)

### Phase 2 — Core delivery flow (~3–4 weeks)

- [ ] Login, Home, Today's Route, Stop Details, Delivery Completion,
      Issue Reporting, Route History, Profile
- [ ] MapLibre route rendering: polyline, numbered stop markers, distinct
      completed / current / remaining marker states
- [ ] Background GPS with sensible sampling — **must stop when the route ends**
- [ ] Navigation handoff to Google Maps / Waze / Apple Maps
- [ ] Delivery geofence warning (configurable, default 150 m)

### Phase 3 — Offline sync engine (~1–2 weeks)

WatermelonDB schema exists (`apps/mobile/src/database/schema.ts`) with
`sync_status` columns, but there is **no API endpoint to sync against**.

- [ ] Implement the API `sync` module first
- [ ] Pull-then-push sync with idempotency keys to prevent duplicate submissions
- [ ] Status UI: ONLINE / OFFLINE / SYNCING / SYNC COMPLETE / SYNC ERROR
- [ ] Photo upload queue with compression before upload

### Phase 4 — Training mode & agent route creation (~2–3 weeks)

- [ ] Training Mode, Route Selection, Live Map, Checkpoint Creation/Details
- [ ] Training route replay with "YOU ARE NEAR CHECKPOINT" proximity alerts
- [ ] Agent route creation — record-by-driving **and** import-from-links
- [ ] Multi-link paste parser (Google/Apple/Waze URLs) with per-link error
      reporting — never silently drop an invalid link
- [ ] Draft autosave + resume

### Phase 5 — Distribution via website (~2–3 days)

- [ ] `eas build -p android --profile preview` → APK
- [ ] Upload to Supabase Storage; serve via signed URL
- [ ] Replace the hardcoded values on `/download-app` with real version, size,
      and build date from an API endpoint
- [ ] Generate a real QR code pointing at the APK URL
- [ ] Document "Install from Unknown Sources" for drivers

---

## Key business rule

Cancelling a subscription must **never** destroy delivery history.

A delivery location goes inactive **only when no active subscriptions remain**:

```
Green Residency — 5 newspaper subscriptions
  1 customer cancels  → location stays ACTIVE, that customer's delivery is removed
  all 5 cancel        → location becomes INACTIVE, drops from future routes
```

Historical routes are immutable. If yesterday's route had 20 stops and one
subscription is cancelled today, today's generated route has 19 stops — and
yesterday's history still shows 20. Prefer **archive** over **delete** everywhere.

---

## Contributing

- Branch off `master` (this repo has no `main`). Never commit directly to it.
- Stage explicit paths — avoid `git add -A`.
- Every fix or feature needs a test. Never weaken an assertion for a green build.
- Never commit `.env`, secrets, tokens, or real customer data.
- Bind all SQL/N1QL parameters — never concatenate caller input.

## License

Private / unpublished.
