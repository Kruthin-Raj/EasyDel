# Testing EasyDel

Two layers, and one deliberately-quarantined third.

| Layer | Count | Needs a server? | Needs the database? |
|---|---|---|---|
| Unit + integration (Vitest) | 114 | no | no |
| End-to-end (Playwright scripts) | 49 | yes | yes |
| `tests/ui.spec.ts` (legacy) | — | — | **broken — see the end** |

---

## Layer 1 — unit and integration

```bash
pnpm --filter web test
```

Fast, no setup, safe to run anywhere. Expect **114 passing**.

| File | Covers |
|---|---|
| `src/lib/optimize.test.ts` | haversine, nearest-neighbour + 2-opt, coordinate validation |
| `src/lib/map-links.test.ts` | Google/Apple/Waze link parsing, short-link detection |
| `src/lib/import-parse.test.ts` | CSV parsing, column auto-detection, duplicate flagging |
| `src/lib/password.test.ts` | scrypt hashing, constant-time compare, strength rules |
| `src/lib/tokens.test.ts` | OTP + reset tokens, expiry, attempt cap, single use |
| `src/lib/checkpoint-types.test.ts` | **per-agent and per-round dropdown isolation**, name-list parsing |

Watch mode while working: `pnpm --filter web test -- --watch`

---

## Layer 2 — end-to-end

These drive a real browser at iPhone-13 size against a real server and
database. They exist because the two worst bugs this project has had were
invisible to unit tests:

- an agent's Delivery history listed **every other agent's** deliveries,
  customer names and street addresses
- the Drivers page rendered for agents, then threw an unhandled ADMIN-only
  error the moment they pressed *Deactivate*

### Run them

```bash
# 1. Build and start the server (a dev server works too, but is slower)
pnpm --filter web build
pnpm --filter web start          # leave running in another terminal

# 2. Create the fixtures. Prints the ids the scripts need.
pnpm --filter @delivery/database test:fixtures setup
#   -> {"deliveryId":"...","routeA":"...","routeB":"..."}

# 3. Run the checks, passing those ids
cd apps/web
node tests/e2e/isolation.mjs <deliveryId>
node tests/e2e/features.mjs  <deliveryId> <routeAId>

# 4. Remove every fixture row when you are done
pnpm --filter @delivery/database test:fixtures destroy
```

Point them at the deployed site instead with `E2E_BASE_URL`:

```bash
E2E_BASE_URL=https://easy-del-web.vercel.app node tests/e2e/isolation.mjs <deliveryId>
```

> **Re-run `test:fixtures reset` between runs of `features.mjs`.** That script
> starts a run and three recordings. A second execution otherwise finds a round
> already open, and reports working features as broken — which is exactly what
> happened while it was being written.

### `isolation.mjs` — 24 checks

Signs in as **agent A** (owns data), **agent B** (must see none of it), and an
**admin** (must still see everything).

- B sees none of A's deliveries, customers, addresses or issues
- B cannot open A's delivery report by typing its URL — it refuses, and the
  refusal page itself leaks no address
- B's dashboard hides fleet headcount and shows only their own figures
- Navigation hides Drivers, Mentors and Reports for agents, but still offers
  Routes and Record a route
- Typing `/drivers` or `/reports` refuses cleanly instead of crashing
- **Positive controls**: A still sees their own delivery, B still sees their own
  route, admin still sees the fleet. Without these, a blank page would pass
  every "sees nothing" assertion.

### `features.mjs` — 25 checks

- **Delivery report**: packages delivered, checkpoints done, per-type breakdown
- **Pick-lists per round**: round one's types are `Big box | Fruit crate`, round
  two's are `Newspaper bundle` and inherit nothing, round three pastes nothing
  and falls back to the usual list
- **Name combobox**: carries every pasted name *and* still accepts free text
- **Route start**: waits for the run console (this genuinely takes 5–6s, because
  starting a run asks OSRM to re-order the stops from the driver's position)
- **"Still in your bag" note**: appears after a checkpoint, names the remaining
  type and count, then clears itself after 9s
- No uncaught client errors on any screen touched

---

## Clearing test data

Everything the fixtures create is tagged `easydel-e2e` in its email, name or
route name, and every delete is scoped by that tag.

```bash
pnpm --filter @delivery/database test:fixtures status    # what exists now
pnpm --filter @delivery/database test:fixtures reset     # open runs/recordings only
pnpm --filter @delivery/database test:fixtures destroy   # every fixture row
```

`status` and `destroy` both print the **real** accounts afterwards, so you can
confirm a cleanup removed only fixtures:

```
Fixture rows tagged "easydel-e2e":
  accounts  0
  routes    0
  ...
Real accounts (must be untouched):
  kruthin123@gmail.com (ADMIN)
```

> **Scope cleanups by identity, never by state.** A cleanup that filtered on
> `status = 'RECORDING'` once deleted a real driver's in-progress round. If a
> delete cannot name what it is deleting, it is not ready to run.

### Never point Prisma at production

`prisma migrate dev`, `db push` and `migrate reset` all destroy data, and
passing the production URL to `--shadow-database-url` wipes it outright — that
is what emptied this database on 8 Sept 2026. Those three scripts now refuse to
run unless the host is local. To change the schema:

```bash
pnpm --filter @delivery/database db:migrate:new <name>   # read-only, prints the SQL
pnpm --filter @delivery/database db:deploy               # applies it
```

See `DEPLOY.md` for the full rule and the restore procedure.

---

## Writing new checks

Four lessons paid for the hard way, all encoded in `tests/e2e/lib.mjs`:

1. **Read `<main>`, not `<body>`.** The sidebar's own wording otherwise
   satisfies assertions like *"the page mentions Routes"*.
2. **Lowercase before comparing.** Stat labels use `text-transform: uppercase`,
   so `innerText` returns `TOTAL DRIVERS`. A case-sensitive check for
   `Total drivers` passes whether the tile is there or not — it reported a
   passing isolation check that was measuring nothing.
3. **Wait for a condition, never sleep.** `waitForTimeout(2500)` reported the
   bag note as broken when it was working; the page simply takes ~6s to come
   back. Use the `appears()` / `disappears()` helpers.
4. **`isVisible()` is not "on screen".** It returns `true` for an element
   translated off-screen, which produced four false failures on the mobile
   drawer. Measure `boundingBox().x` when position is the question.

And always pair an absence assertion with a positive control. *"B sees none of
A's data"* is satisfied by a page that failed to load.

---

## Known broken: `apps/web/tests/ui.spec.ts`

The original Playwright suite still signs in as the seeded demo accounts, which
were deliberately deleted. **It fails, and that is expected.** It is not wired
into `pnpm test`, so it does not affect the 114 unit tests or the 49 e2e checks.

Rewriting it against `tests/e2e/lib.mjs` is a TODO — the fixtures and helpers it
would need now exist.
