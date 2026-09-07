# Deploying EasyDel

This deploys **`apps/web`** — the whole product. The NestJS API in `apps/api` is
not deployed and is not needed: the dashboard talks to Postgres directly.

Once set up, **every push to `main` redeploys automatically**, usually in about
a minute. That is the "change it later and it updates" part — you edit, commit,
push, and the live site follows.

---

## Before you start

| | |
|---|---|
| A GitHub account | the repo lives here |
| A Vercel account | free tier is fine; sign in *with GitHub* |
| Your Supabase project | already set up — Postgres + the photo bucket |
| Your SMTP details | already working locally |

Nothing needs installing. Vercel builds in the cloud.

---

## Step 1 — Check it builds, and check your environment

From the repo root:

```bash
pnpm install
pnpm check:env          # verifies every variable AND that the service answers
pnpm --filter web test
pnpm --filter web build
```

Expect 91 tests passing and a build listing ~27 routes. If it fails here it
will fail on Vercel too — fix it first.

`pnpm check:env` is worth running before every deploy. It does more than check
for missing keys: it opens a connection to the database, the SMTP server and
Supabase Storage, and tells you which one is wrong. It exits non-zero on a real
problem, so it can gate a deploy. Secrets are never printed — only whether they
are set and how long they are.

It catches the mistakes that otherwise surface as a broken production site:

- a `SMTP_FROM` on a domain you do not own (providers reject it)
- an unpooled `DATABASE_URL` (fine locally, exhausts connections when deployed)
- a `NEXT_PUBLIC_` prefix on a secret (which would ship it to the browser)
- a storage bucket that is public, or missing
- `NEXT_PUBLIC_SITE_URL` still pointing at localhost

To check the *deployed* environment rather than your local file, run it on the
host with `node scripts/check-env.mjs --env`.

---

## Step 2 — Push to GitHub

The repo has one branch, `main`, and your work is uncommitted.

```bash
git status                      # review what you are about to commit
git add -A                      # or add paths individually
git commit -m "EasyDel delivery platform"
```

Create the GitHub repo and push. **Make it private** — this codebase talks to a
database holding customer addresses:

```bash
gh repo create EasyDel --private --source=. --remote=origin --push
```

No `gh` CLI? Create an empty **private** repo on github.com, then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/EasyDel.git
git push -u origin main
```

### Confirm no secrets went up

```bash
git ls-files | grep -E "(^|/)\.env(\.local)?$" && echo "STOP — env file tracked" || echo "OK"
```

`.env` and `.env.local` are gitignored. Your database password, SMTP password
and Supabase keys stay on your machine and in Vercel.

---

## Step 3 — Create the Vercel project

1. **vercel.com → Add New → Project**, import the `EasyDel` repo.
2. Set these — Root Directory is the one people miss:

   | Setting | Value |
   |---|---|
   | **Root Directory** | `apps/web` |
   | Framework Preset | Next.js *(auto-detected)* |
   | Build Command | *leave default* — `package.json` already generates the Prisma client |
   | Install Command | *leave default* |

3. Leave **"Include source files outside of the Root Directory"** enabled
   (the default). Without it the `@delivery/types` workspace package will not
   resolve and the build fails.
4. Add the environment variables below **before** clicking Deploy.

---

## Step 4 — Environment variables

**Settings → Environment Variables**. Add each for *Production*, *Preview* and
*Development*.

### Required — the app will not work without these

| Variable | Where from | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase → Connect → **Session pooler** | Must be the **pooled** URL (port `6543`). See the warning below. |
| `DIRECT_URL` | Supabase → Connect → Direct connection | Port `5432`, for migrations. |
| `JWT_SECRET` | your `.env` | Signs session cookies. Changing it signs everyone out. |
| `NEXT_PUBLIC_SITE_URL` | your Vercel URL | e.g. `https://easydel.vercel.app`, **no trailing slash**. Password-reset links are built from this — a wrong value means broken reset emails. |

### Required for email — signup and password reset

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`

Copy from your `.env`. Leave them out and the app still runs, but verification
codes go to the server log instead of an inbox — and nobody can read that on
Vercel, so **signup becomes impossible**.

### Required for checkpoint photos

| Variable | Notes |
|---|---|
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔴 **Server-only. Never prefix it with `NEXT_PUBLIC_`.** It bypasses row-level security, and anything `NEXT_PUBLIC_` is embedded in the browser bundle. |
| `STORAGE_BUCKET` | `delivery-proofs` |

### Optional

| Variable | If unset |
|---|---|
| `OSRM_URL` | Routes still optimise, using straight-line distance; the navigation map draws a straight line instead of following roads |
| `NEXT_PUBLIC_MAP_STYLE_URL` | CARTO dark basemap |
| `GEOCODING_URL`, `ROUTING_PROVIDER` | unused today; reserved |

### Not needed on Vercel

`ADMIN_PASSWORD` is read only by the seed script, which you run from your own
machine. Don't add it.

> **⚠️ Use the pooled database URL.** Each serverless function opens its own
> connection. The direct endpoint (`5432`) will hit Supabase's connection limit
> under real load and start refusing requests. The pooled endpoint (`6543`)
> exists for exactly this.

---

## Step 5 — Deploy

Click **Deploy**. The first build takes 2–4 minutes.

Then set `NEXT_PUBLIC_SITE_URL` to the URL Vercel just gave you and
**redeploy** — you couldn't know it before the first deploy.

---

## Step 6 — Check it works

```bash
URL=https://your-project.vercel.app

echo "/login -> $(curl -s -o /dev/null -w '%{http_code}' $URL/login)"
for p in / /routes /locations /record; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' $URL$p)"
done
```

`/login` must return **200**; everything else must return **307** (redirect to
login). **If any page returns 200 while signed out, stop — the auth gate is
broken.**

Then in a browser:

- [ ] Sign in with your admin account
- [ ] Dashboard loads — proves the database is reachable
- [ ] Locations and Routes list your data
- [ ] A map renders and pins appear
- [ ] Sign up with a real address; the 6-digit code arrives
- [ ] Every sidebar link loads

### The database has no demo data

The demo accounts and sample locations were deliberately removed. Your admin
account is the only user, so:

- **Do not run `db:seed` against production.** It recreates four accounts whose
  password is whatever `ADMIN_PASSWORD` happens to be. The script now refuses to
  run when `NODE_ENV=production` or on Vercel, but do not rely on that alone.
- If you lose your admin password, recovery is the `/forgot-password` flow —
  which needs SMTP working. Confirm email delivery *before* you need it.
- The Playwright suite (`apps/web/tests/ui.spec.ts`) still targets the old demo
  accounts and will fail until it is rewritten. The 91 unit and integration
  tests are unaffected and still pass.

### Location needs HTTPS

Browsers only expose GPS on secure origins. Vercel gives you HTTPS, so
recording and running routes work on the deployed site — but they will **not**
work if you open the site over plain `http://` on your LAN.

---

## Step 7 — Making changes later

This is the part that keeps working on its own:

```bash
# edit files
git add -A
git commit -m "what changed"
git push
```

Vercel sees the push and rebuilds. About a minute later it's live. No manual
deploy step.

What you get for free:

- **Push to a branch** instead of `main` and Vercel builds a **preview URL** — a
  full working copy on its own address, so you can try a change before anyone
  else sees it.
- **A failed build doesn't take the site down.** The previous deployment keeps
  serving until a build succeeds.
- **Instant rollback**: Vercel → Deployments → pick an earlier one → *Promote to
  Production*.

### Database changes are the exception

Code deploys automatically; the schema does not. After changing
`schema.prisma`:

```bash
pnpm --filter @delivery/database db:migrate --name what_changed   # local
git add -A && git commit -m "migration: what_changed" && git push
pnpm --filter @delivery/database db:deploy                        # apply to the live DB
```

Run `db:deploy` **before or immediately after** the deploy that needs it.
Shipping code that expects a column which doesn't exist yet causes runtime
errors on the live site.

---

## If the build fails

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module '@delivery/types'` | Root Directory set, outside-files disabled | Enable "Include source files outside of the Root Directory" |
| `@prisma/client did not initialize yet` | Prisma client not generated | The build script handles this — check Build Command is still the default |
| `ERR_PNPM_OUTDATED_LOCKFILE` | lockfile out of sync | `pnpm install` locally, commit `pnpm-lock.yaml`, push |
| Wrong package manager used | a stray `package-lock.json` | Only the root `pnpm-lock.yaml` should exist |
| Pages 500 after deploying | env var missing or wrong | Vercel → Deployments → Runtime Logs names the variable |
| `Can't reach database server` | using the direct URL | Switch `DATABASE_URL` to the pooled endpoint (`6543`) |
| Reset emails link to localhost | `NEXT_PUBLIC_SITE_URL` still local | Set it to the Vercel URL and redeploy |

---

## Custom domain

Vercel → Settings → Domains → add it, then point your DNS as instructed. HTTPS
is issued automatically. **Update `NEXT_PUBLIC_SITE_URL` to the new domain and
redeploy**, or password-reset links keep pointing at the old address.

---

## Before real drivers use it

Not blockers for deploying, but they matter once this is doing actual work:

1. **Self-host OSRM.** `router.project-osrm.org` is a demo server — rate-limited,
   and its terms prohibit production use. Setup is in the README.
2. **Rate-limit sign-in and code requests.** Nothing throttles repeated attempts
   today.
3. **Reconsider open signup.** Anyone with the URL can register. They land as a
   `DELIVERY_AGENT`, which can't reach Settings or other people's routes, but
   they can see customer addresses.
4. **Check your backups.** Confirm what your Supabase plan actually retains.
