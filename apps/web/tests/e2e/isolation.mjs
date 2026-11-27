/**
 * Tenant isolation + route sharing: one person's personal delivery history
 * remains private even when they share a route by code/link for someone else
 * to memorize and deliver.
 *
 *   node tests/e2e/isolation.mjs <deliveryId>
 *
 * The deliveryId comes from `test-fixtures.mjs setup` and belongs to agent A.
 */

import { loadEnv, createChecker, launch, signIn, mainText, BASE, TAG } from './lib.mjs';

const DELIVERY_ID = process.argv[2];
if (!DELIVERY_ID) {
  console.error('Usage: node tests/e2e/isolation.mjs <deliveryId from fixtures setup>');
  process.exit(1);
}

const env = loadEnv();
const password = env.ADMIN_PASSWORD;
const { check, finish } = createChecker();
const browser = await launch();

const A = `${TAG}-a@easydel.invalid`;
const B = `${TAG}-b@easydel.invalid`;

// --------------------------------------------------------------- agent A ---
console.log('\nUser A — owns the data (control group)\n');
const a = await signIn(browser, A, password);
await a.goto(`${BASE}/delivery-history`, { waitUntil: 'networkidle' });
const aText = (await a.locator('body').innerText()).toLowerCase();
check('A sees their own delivery', aText.includes(`${TAG} secret house`));
check('A sees their own issue', aText.includes('private issue note'));

// --------------------------------------------------------------- agent B ---
console.log('\nUser B — private history stays isolated, sharing works via code\n');
const b = await signIn(browser, B, password);

await b.goto(`${BASE}/delivery-history`, { waitUntil: 'networkidle' });
const bHistory = (await b.locator('body').innerText()).toLowerCase();
check("B does NOT see A's delivery", !bHistory.includes(`${TAG} secret house`));
check("B does NOT see A's customer", !bHistory.includes('mr confidential'));
check("B does NOT see A's address", !bHistory.includes('42 private lane'));
check("B does NOT see A's issue", !bHistory.includes('private issue note'));

// Guessable delivery detail URL must refuse rather than render.
await b.goto(`${BASE}/delivery-history/${DELIVERY_ID}`, { waitUntil: 'networkidle' });
const bDetail = (await b.locator('body').innerText()).toLowerCase();
check(
  "B cannot open A's delivery report by URL",
  bDetail.includes('not yours') || bDetail.includes('permission required'),
);
check("B's refusal page leaks no address", !bDetail.includes('42 private lane'));

await b.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const bDash = await mainText(b);
check('dashboard has no admin driver headcount', !bDash.includes('total drivers'));
check('dashboard offers join by code', bDash.includes('open a shared route'));
check("B dashboard shows no trace of A's house", !bDash.includes(`${TAG} secret house`));

// Positive control: B sees B's own work, and never A's private locations.
await b.goto(`${BASE}/routes`, { waitUntil: 'networkidle' });
check("B sees B's own route", (await mainText(b)).includes("b's round"));

await b.goto(`${BASE}/locations?status=ALL`, { waitUntil: 'networkidle' });
const bLocations = await mainText(b);
check("B does NOT see A's location in Locations", !bLocations.includes(`${TAG} secret house`));
check("B does NOT see A's address in Locations", !bLocations.includes('42 private lane'));

await b.goto(`${BASE}/routes/new`, { waitUntil: 'networkidle' });
check("B does NOT see A's location when creating a route", !(await mainText(b)).includes(`${TAG} secret house`));

// ------------------------------------------- nav + peer-to-peer sharing ---
console.log('\nNavigation has no admin pages; route sharing & memorize work\n');
await b.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await b.getByRole('button', { name: 'Open navigation' }).click();
await b.waitForTimeout(400);
const nav = await b.locator('nav[aria-label="Main"]').last().innerText();
check('nav has no Drivers admin page', !nav.includes('Drivers'));
check('nav has no Mentors admin page', !nav.includes('Mentors'));
check('nav has no Live GPS page', !nav.includes('Live GPS'));
check('nav offers My routes', nav.includes('My routes'));
check('nav offers Join by code', nav.includes('Join by code'));
check('nav offers Record a route', nav.includes('Record a route'));
check('nav offers Reports', nav.includes('Reports'));

// Legacy admin & live-GPS routes were removed completely (must 404).
for (const legacy of ['/drivers', '/mentors', '/live']) {
  const res = await b.goto(`${BASE}${legacy}`, { waitUntil: 'networkidle' });
  check(`legacy ${legacy} is removed (404)`, res?.status() === 404);
}

// B can join A's route by share code E2EROUTA, save it, and memorize it.
await b.goto(`${BASE}/share/E2EROUTA`, { waitUntil: 'networkidle' });
const shareText = await mainText(b);
check('share page loads by code', shareText.includes("a's round"));
const saveBtn = b.getByRole('button', { name: /Save to my routes/i });
if (await saveBtn.count()) {
  await saveBtn.first().click();
  await b.waitForURL(/\/routes\/[0-9a-f-]{36}/, { timeout: 30000 });
}
check('saving shared route lands on route page', /\/routes\/[0-9a-f-]{36}/.test(b.url()));

await b.getByRole('link', { name: /Memorize route/i }).first().click();
await b.waitForURL(/\/memorize/, { timeout: 30000 });
check('memorize mode loads for saved route', (await mainText(b)).includes('memorization progress'));

// Even after saving A's route, B still sees none of A's past deliveries.
await b.goto(`${BASE}/delivery-history`, { waitUntil: 'networkidle' });
check("B still does NOT see A's past deliveries", !(await mainText(b)).includes(`${TAG} secret house`));

await finish(browser);
