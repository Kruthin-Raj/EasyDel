/**
 * The driver-facing features, exercised through a phone-sized browser.
 *
 *   node tests/e2e/features.mjs <deliveryId> <routeAId>
 *
 * Both ids come from `test-fixtures.mjs setup`.
 *
 * Run `test-fixtures.mjs reset` first. This script starts a run and a
 * recording, so a second execution otherwise finds a round already open and
 * reports working features as broken — which is exactly what happened while
 * these were being written.
 */

import {
  loadEnv,
  createChecker,
  launch,
  signIn,
  mainText,
  appears,
  disappears,
  BASE,
  TAG,
} from './lib.mjs';

const [DELIVERY_ID, ROUTE_A] = process.argv.slice(2);
if (!DELIVERY_ID || !ROUTE_A) {
  console.error('Usage: node tests/e2e/features.mjs <deliveryId> <routeAId>');
  process.exit(1);
}

const env = loadEnv();
const { check, finish } = createChecker();
const browser = await launch();
const p = await signIn(browser, `${TAG}-a@easydel.invalid`, env.ADMIN_PASSWORD);

const clientErrors = [];
p.on('pageerror', (e) => clientErrors.push(String(e.message)));

// ------------------------------------------- the per-delivery run report ---
console.log('\nDelivery report — what went out on the round\n');
await p.goto(`${BASE}/delivery-history/${DELIVERY_ID}`, { waitUntil: 'networkidle' });
const report = (await p.locator('body').innerText()).toLowerCase();
check('report opens', report.includes('delivery report'));
check('shows packages delivered', report.includes('packages delivered'));
check('shows checkpoints done', report.includes('checkpoints done'));
check('breaks packages down by type', report.includes('packages by type'));
check('names the actual package type', report.includes('large package'));
check('lists every stop on the round', report.includes('every stop on this round'));

// ------------------------- names + package types, isolated per round ---
console.log('\nPick-lists are per round, and accept free text\n');

/** Reads the package-type dropdown on the add-checkpoint form. */
async function typeOptions() {
  const add = p.getByRole('button', { name: /Add checkpoint/i });
  if (await add.count()) await add.first().click();
  await p.waitForTimeout(700);
  return p
    .locator('select[name="deliveryType"] option')
    .evaluateAll((els) => els.map((e) => e.getAttribute('value')).filter(Boolean));
}

async function startRound(name, names, types) {
  await p.goto(`${BASE}/record`, { waitUntil: 'networkidle' });
  await p.locator('input[name="routeName"]').fill(name);
  if (names) await p.locator('textarea[name="nameOptions"]').fill(names);
  if (types) await p.locator('textarea[name="typeOptions"]').fill(types);
  await p.getByRole('button', { name: /Start recording/i }).click({ timeout: 40000 });
  await p.waitForURL(/\/record\/[0-9a-f-]{36}/, { timeout: 40000 });
  await p.waitForTimeout(1200);
}

async function endRound() {
  await p
    .getByRole('button', { name: /Abandon|End route/i })
    .first()
    .click({ timeout: 30000 })
    .catch(() => {});
  await p.waitForTimeout(3000);
}

// Round one: its own names and types.
await startRound(
  `${TAG} round one`,
  'Mr Sharma — 12 Green Street\nAvengers Tower flat 3B\nCorner shop',
  'Big box\nFruit crate',
);

const nameField = p.locator('input[name="name"]').first();
const addBtn = p.getByRole('button', { name: /Add checkpoint/i });
if (await addBtn.count()) await addBtn.first().click();
await p.waitForTimeout(700);

check(
  'checkpoint name field is a combobox',
  (await nameField.getAttribute('list')) === 'round-house-names',
);
const names = await p
  .locator('#round-house-names option')
  .evaluateAll((els) => els.map((e) => e.getAttribute('value')));
check('dropdown carries every pasted name', names.length === 3, names.join(' | '));
check('a long pasted name is offered', names.some((n) => n?.includes('Mr Sharma')));

// The explicit requirement: pick from the list OR type your own.
await nameField.fill('Somewhere brand new');
check('the field still accepts a typed name', (await nameField.inputValue()) === 'Somewhere brand new');

const t1 = await typeOptions();
check("round one shows only round one's types", t1.join('|') === 'Big box|Fruit crate', t1.join(' | '));
check('round one does not show the team defaults', !t1.includes('Large package'));
check('pick-lists can be edited mid-round', (await p.locator('textarea[name="typeOptions"]').count()) > 0);

await endRound();

// Round two: a different list. Must not inherit round one's.
await startRound(`${TAG} round two`, null, 'Newspaper bundle');
const t2 = await typeOptions();
check("round two shows only round two's types", t2.join('|') === 'Newspaper bundle', t2.join(' | '));
check("round two did NOT inherit round one's types", !t2.includes('Big box'));

await endRound();

// Round three: nothing pasted, so it falls back to the usual list.
await startRound(`${TAG} round three`, null, null);
const t3 = await typeOptions();
check('a round with no list falls back to the usual types', t3.includes('Large package'), t3.slice(0, 3).join(' | '));
check("and inherits nothing from earlier rounds", !t3.includes('Big box') && !t3.includes('Newspaper bundle'));

await endRound();

// ------------------------- starting a route, and the "in your bag" note ---
console.log('\nStarting a route, and the bag note after each checkpoint\n');
await p.goto(`${BASE}/routes/${ROUTE_A}/run`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
check('run page loads for the route owner', (await mainText(p)).includes('start the run'));

const startRun = p.getByRole('button', { name: /^Start run$/i });
check('Start run button is present', (await startRun.count()) > 0);

if (await startRun.count()) {
  await startRun.first().click({ timeout: 30000 });

  // startRunAction re-orders the stops from the driver's actual position,
  // which calls OSRM, so the redirect regularly takes 5-6s. Wait for the
  // console rather than sleeping.
  const ready = await appears(p.getByRole('button', { name: /Mark delivered/i }), 60000);
  check('route start succeeds', ready && (await mainText(p)).includes('progress'));

  if (ready) {
    await p.getByRole('button', { name: /Mark delivered/i }).first().click({ timeout: 30000 });

    const note = p.locator('[role="status"]').filter({ hasText: /bag/i });
    const shown = await appears(note, 30000);
    check('bag note appears after a checkpoint', shown);
    if (shown) {
      const text = (await note.first().innerText()).replace(/\n/g, ' ');
      check('it names the remaining type and count', /small package/i.test(text), text);
    }
    check('the note clears itself', await disappears(note, 25000));
    check('progress advances after the outcome', (await mainText(p)).includes('1/2'));
  }
}

// ------------------------------- rounds in history, and the round report ---
console.log('\nHistory lists rounds, and a round opens its report\n');
await p.goto(`${BASE}/delivery-history`, { waitUntil: 'networkidle' });
const history = (await p.locator('main').first().innerText()).toLowerCase();
check('history lists rounds, not only deliveries', history.includes('rounds ('));
check("the fixture's round is listed", history.includes("a's round"));
check('the delivery table has a Note column', history.includes('note'));

// Clicking a round must open its report.
await p.getByRole('link', { name: new RegExp(`${TAG} A's round`) }).first().click();
await p.waitForURL(/\/delivery-history\/runs\//, { timeout: 30000 });
await p.waitForTimeout(1500);
const roundReport = await p.locator('main').first().innerText();
check('round report opens from the history list', /Round report/i.test(roundReport));
check('the round report shows a package total', /Packages delivered/i.test(roundReport));
check(
  'the round report links back to the route',
  (await p.getByRole('link', { name: /The route/i }).count()) > 0,
);

/*
 * Note formatting and totals are asserted against the fixture's own round,
 * reached by id.
 *
 * Two traps here, both hit while writing this: `report` further up is
 * *lowercased* body text, so matching "Secret House" against it always fails;
 * and clicking the newest round is not deterministic, because this script
 * starts a fresh run on the same route earlier on — that round has one stop
 * and no notes, so both a 5-package total and the note assertions would fail
 * against it for reasons that have nothing to do with the report.
 */
await p.goto(`${BASE}/delivery-history/${DELIVERY_ID}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const noted = await p.locator('main').first().innerText();
check(
  'notes appear as "name — note"',
  /Secret House[^\n]*—[^\n]*box not returned/.test(noted),
  (noted.match(/Secret House[^\n]*/) ?? [''])[0].slice(0, 60),
);
check(
  'a note repeated across stops is grouped with its count',
  /said more than once/i.test(noted) && /×2/.test(noted),
);
check('packages summed across the round (3 + 2)', /\b5\b/.test(noted));

check('no uncaught client errors anywhere', clientErrors.length === 0, clientErrors.slice(0, 2).join(' / '));

await finish(browser);
