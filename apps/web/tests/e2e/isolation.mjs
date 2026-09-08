/**
 * Tenant isolation: one delivery agent must not see another's work.
 *
 *   node tests/e2e/isolation.mjs <deliveryId>
 *
 * The deliveryId comes from `test-fixtures.mjs setup` and belongs to agent A.
 *
 * This exists because every console page used to check only that *someone* was
 * signed in and then query globally. An agent's Delivery history listed every
 * other agent's deliveries — customer names and street addresses included —
 * and the dashboard showed the whole fleet's figures. The fix is `lib/scope.ts`;
 * this is the proof it holds.
 *
 * Assertions are deliberately about absence. A page that fails to load also
 * "contains none of A's data", so each section also asserts that the agent can
 * still see their own work — otherwise a broken page would pass.
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
const ADMIN = `${TAG}-admin@easydel.invalid`;

// --------------------------------------------------------------- agent A ---
console.log('\nAgent A — owns the data (control group)\n');
const a = await signIn(browser, A, password);
await a.goto(`${BASE}/delivery-history`, { waitUntil: 'networkidle' });
const aText = (await a.locator('body').innerText()).toLowerCase();
check('A sees their own delivery', aText.includes(`${TAG} secret house`));
check("A sees their own issue", aText.includes("private issue note"));

// --------------------------------------------------------------- agent B ---
console.log('\nAgent B — must see none of it\n');
const b = await signIn(browser, B, password);

await b.goto(`${BASE}/delivery-history`, { waitUntil: 'networkidle' });
const bHistory = (await b.locator('body').innerText()).toLowerCase();
check("B does NOT see A's delivery", !bHistory.includes(`${TAG} secret house`));
check("B does NOT see A's customer", !bHistory.includes('mr confidential'));
check("B does NOT see A's address", !bHistory.includes('42 private lane'));
check("B does NOT see A's issue", !bHistory.includes('private issue note'));

// The URL is guessable, so the detail page must refuse rather than render.
await b.goto(`${BASE}/delivery-history/${DELIVERY_ID}`, { waitUntil: 'networkidle' });
const bDetail = (await b.locator('body').innerText()).toLowerCase();
check(
  "B cannot open A's delivery report by URL",
  bDetail.includes('not yours') || bDetail.includes('permission required'),
);
check("B's refusal page leaks no address", !bDetail.includes('42 private lane'));

await b.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const bDash = await mainText(b);
check('B dashboard hides fleet headcount', !bDash.includes('total drivers'));
check('B dashboard hides active-driver count', !bDash.includes('active drivers'));
check('B dashboard is framed as their own', bDash.includes('my routes today'));
check("B dashboard shows no trace of A's house", !bDash.includes(`${TAG} secret house`));

// Positive control: B must still see B's work, or the checks above are vacuous.
await b.goto(`${BASE}/routes`, { waitUntil: 'networkidle' });
check("B sees B's own route", (await mainText(b)).includes("b's round"));

// ------------------------------------------- hidden nav, and the crash ---
console.log('\nNavigation hides what an agent cannot open\n');
await b.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await b.getByRole('button', { name: 'Open navigation' }).click();
await b.waitForTimeout(400);
const nav = await b.locator('nav[aria-label="Main"]').last().innerText();
check('nav hides Drivers', !nav.includes('Drivers'));
check('nav hides Mentors', !nav.includes('Mentors'));
check('nav hides Reports', !nav.includes('Reports'));
check('nav still offers Routes', nav.includes('Routes'));
check('nav still offers Record a route', nav.includes('Record a route'));

// Typing the URL must refuse cleanly. Pressing Deactivate on this page used to
// throw an unhandled ADMIN-only error and render Next's error screen.
await b.goto(`${BASE}/drivers`, { waitUntil: 'networkidle' });
const drivers = (await b.locator('body').innerText()).toLowerCase();
check(
  'typed /drivers refuses cleanly, no crash',
  drivers.includes('administrator') && !drivers.includes('application error'),
);
check('/drivers leaks no driver emails', !drivers.includes('@easydel.invalid'));

await b.goto(`${BASE}/reports`, { waitUntil: 'networkidle' });
const reports = (await b.locator('body').innerText()).toLowerCase();
check(
  'typed /reports refuses cleanly',
  reports.includes('whole operation') || reports.includes('permission required'),
);

// ----------------------------------------------------------------- admin ---
console.log('\nAdmin still sees everything\n');
const admin = await signIn(browser, ADMIN, password);
await admin.goto(`${BASE}/delivery-history`, { waitUntil: 'networkidle' });
check(
  "admin sees A's delivery",
  (await admin.locator('body').innerText()).toLowerCase().includes(`${TAG} secret house`),
);
await admin.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const adminDash = await mainText(admin);
check('admin keeps fleet headcount', adminDash.includes('total drivers'));
check('admin keeps the audit trail', adminDash.includes('audit trail'));

await finish(browser);
