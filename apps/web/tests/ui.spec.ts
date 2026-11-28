import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

/**
 * End-to-end checks against a running dashboard with a seeded database.
 *
 * Prerequisites:
 *   pnpm --filter @delivery/database db:seed
 *   pnpm --filter web build && pnpm --filter web start
 *
 * ADMIN_PASSWORD must be set in the environment (it is read from
 * apps/web/.env.local by `next start`, and needed here to sign in).
 */

const EMAIL = 'admin@easydel.dev';

/*
 * Read from the environment with no fallback on purpose. A hardcoded default
 * would be a password literal committed to the repository, and it would
 * silently pass against whatever password .env.local happens to hold.
 *
 * Assigned via an intermediate const because TypeScript does not carry a
 * module-level throw-narrowing into function bodies below.
 */
const RAW_PASSWORD = process.env.ADMIN_PASSWORD;
if (!RAW_PASSWORD) {
  throw new Error(
    'ADMIN_PASSWORD is not set. Add it to apps/web/.env.local (the Playwright ' +
      'config loads that file) or export it before running the suite.',
  );
}
const PASSWORD: string = RAW_PASSWORD;

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Assert on the URL and a dashboard-only element. The login page's own
  // heading is also "Welcome back", so matching that text alone would pass
  // even when sign-in silently failed.
  await expect(page).toHaveURL(/localhost:\d+\/(\?.*)?$/);
  await expect(page.getByText('Open a shared route')).toBeVisible();
}

test.describe('authentication', () => {
  test('unauthenticated visitors are redirected to the login page', async ({ page }) => {
    await page.goto('/locations');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('a wrong password is rejected without revealing which factor failed', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByTestId('form-error')).toContainText('Invalid email or password');
  });

  test('signing in and out works', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    // And the session is really gone, not just navigated away from.
    await page.goto('/locations');
    await expect(page).toHaveURL(/\/login/);
  });

  test('the signup, forgot-password and verify pages are reachable', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Create one' }).click();
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByRole('link', { name: /Forgot your password/ }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
  });

  /*
   * One assertion per test, each from a fresh page load. Reusing the form
   * after the action re-renders it left the previous values in place and the
   * second assertion tested the wrong thing.
   */
  async function attemptSignup(page: Page, password: string, confirm: string) {
    await page.goto('/signup');
    // Located by name attribute: required fields render a "*" inside the
    // label, so getByLabel('Password') does not match cleanly.
    await page.locator('input[name="firstName"]').fill('Test');
    await page.locator('input[name="email"]').fill(`nobody+${Date.now()}@example.com`);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="confirmPassword"]').fill(confirm);
    await page.getByRole('button', { name: 'Create account' }).click();
  }

  test('signup rejects mismatched passwords', async ({ page }) => {
    await attemptSignup(page, 'averylongpassword', 'differentpassword');
    await expect(page.getByTestId('form-error')).toContainText('do not match');
  });

  test('signup rejects a password under 8 characters', async ({ page }) => {
    await attemptSignup(page, 'short', 'short');
    await expect(page.getByTestId('form-error')).toContainText('at least 8 characters');
  });

  test('signup rejects a common password', async ({ page }) => {
    await attemptSignup(page, '12345678', '12345678');
    await expect(page.getByTestId('form-error')).toContainText('too common');
  });

  test('signing up with an existing email offers sign-in instead of failing', async ({ page }) => {
    await page.goto('/signup');
    await page.locator('input[name="firstName"]').fill('Sarah');
    await page.locator('input[name="email"]').fill(EMAIL);
    await page.locator('input[name="password"]').fill('a-decent-password');
    await page.locator('input[name="confirmPassword"]').fill('a-decent-password');
    await page.getByRole('button', { name: 'Create account' }).click();

    // Guidance, not an error: neutral tone plus a route forward.
    await expect(page.getByTestId('form-info')).toContainText('already have an account');
    await expect(page.getByTestId('form-error')).toHaveCount(0);

    await page.getByRole('link', { name: 'Sign in instead' }).click();
    await expect(page).toHaveURL(/[/]login/);
  });

  test('the forgot-password form never reveals whether an account exists', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('definitely-not-registered@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByTestId('form-success')).toContainText('If an account exists');
  });

  test('a stale password-reset link is refused', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: /no longer works/ })).toBeVisible();
  });
});

test.describe('dashboard pages render real data', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('dashboard shows seeded counts and route sharing card', async ({ page }) => {
    await expect(page.getByText('My routes').first()).toBeVisible();
    await expect(page.getByText('Open a shared route')).toBeVisible();
    await expect(page.getByText('Saved shared routes')).toBeVisible();
    await expect(page.getByText('Total drivers')).toHaveCount(0);
    await expect(page.getByText('Chart Visualization Placeholder')).toHaveCount(0);
  });

  test('locations list shows seeded buildings and filters by status', async ({ page }) => {
    await page.goto('/locations');
    await expect(page.getByText('Green Residency')).toBeVisible();
    await expect(page.getByText('Sai Towers')).toBeVisible();

    // The cancelled seed location must be hidden by the default ACTIVE filter.
    await expect(page.getByText('Old Depot Store')).toHaveCount(0);

    await page.getByLabel('Status').selectOption('CANCELLED');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('Old Depot Store')).toBeVisible();
  });

  test('routes list, share link, memorize mode and detail page work', async ({ page }) => {
    await page.goto('/routes');
    await expect(page.getByText('Morning Newspaper Route 01')).toBeVisible();
    await expect(page.getByText('MORN0001').first()).toBeVisible();

    await page.getByRole('link', { name: 'Morning Newspaper Route 01' }).click();
    await expect(page.getByRole('heading', { name: 'Morning Newspaper Route 01' })).toBeVisible();
    await expect(page.getByText('Stops in order')).toBeVisible();
    await expect(page.getByText('Version history')).toBeVisible();

    await page.getByRole('link', { name: /Memorize route/i }).first().click();
    await expect(page).toHaveURL(/\/memorize$/);
    await expect(page.getByText(/Memorization progress/i)).toBeVisible();
  });

  test('recorded rounds page shows seeded session', async ({ page }) => {
    await page.goto('/training-routes');
    await expect(page.getByText('Morning Route - Area 1 (Training)')).toBeVisible();
  });

  test('reports computes personal aggregates', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.getByText('Success rate')).toBeVisible();
    await expect(page.getByText('Deliveries by outcome')).toBeVisible();
    await expect(page.getByText('My route totals')).toBeVisible();
  });

  test('delivery history loads without crashing', async ({ page }) => {
    await page.goto('/delivery-history');
    await expect(page.getByRole('heading', { name: 'Delivery history' })).toBeVisible();
  });

  test('settings loads per-user preferences', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByLabel(/Your default options when recording a checkpoint/)).toBeVisible();
    await expect(page.getByLabel(/Warn if you are further than/)).toHaveValue(/\d+/);
  });

  test('download page does not advertise a build that does not exist', async ({ page }) => {
    await page.goto('/download-app');
    await expect(page.getByText('No downloadable build exists yet')).toBeVisible();
    await expect(page.getByText('45.2 MB')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Download Latest APK/ })).toHaveCount(0);
  });

  test('every sidebar link resolves and removed admin/live routes 404', async ({ page }) => {
    const links = [
      '/',
      '/routes',
      '/share',
      '/record',
      '/routes/from-links',
      '/training-routes',
      '/locations',
      '/imports',
      '/delivery-history',
      '/reports',
      '/settings',
    ];
    for (const href of links) {
      const response = await page.goto(href);
      expect(response?.status(), `${href} should not 404`).toBe(200);
    }
    for (const removed of ['/live', '/drivers', '/mentors']) {
      const response = await page.goto(removed);
      expect(response?.status(), `${removed} should be removed`).toBe(404);
    }

    for (const publicPage of ['/about', '/contact']) {
      const response = await page.goto(publicPage);
      expect(response?.status(), `${publicPage} should load`).toBe(200);
    }
  });
});

/*
 * These tests write to the database, so they clean up after themselves.
 * Without this the location created below survives the run and then trips the
 * duplicate guard on the next one — the guard working correctly, but the test
 * failing spuriously.
 */
const TEST_PREFIX = 'Playwright Test Building';

test.describe('mutations persist', () => {
  const prisma = new PrismaClient();

  async function removeTestLocations() {
    const created = await prisma.deliveryLocation.findMany({
      where: { name: { startsWith: TEST_PREFIX } },
      select: { id: true },
    });
    const ids = created.map((c) => c.id);
    if (ids.length === 0) return;
    // Clear dependent rows first — a location may already be on a route stop.
    await prisma.routeStop.deleteMany({ where: { deliveryLocationId: { in: ids } } });
    await prisma.locationHistory.deleteMany({ where: { deliveryLocationId: { in: ids } } });
    await prisma.subscription.deleteMany({ where: { deliveryLocationId: { in: ids } } });
    await prisma.deliveryLocation.deleteMany({ where: { id: { in: ids } } });
  }

  test.beforeAll(removeTestLocations);
  test.afterAll(async () => {
    await removeTestLocations();
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('creating a location writes it to the database', async ({ page }) => {
    const name = `${TEST_PREFIX} ${Date.now()}`;

    await page.goto('/locations/new');
    await page.getByLabel('Name', { exact: false }).first().fill(name);
    await page.getByLabel('Address').fill('99 Test Road, Tirupati');
    // Far from every seeded location so the duplicate guard does not trip.
    await page.getByLabel('Latitude').fill('13.9000');
    await page.getByLabel('Longitude').fill('79.9000');
    await page.getByRole('button', { name: 'Create location' }).click();

    // Redirects to the list, where the new row must appear.
    await expect(page).toHaveURL(/\/locations$/);
    await expect(page.getByText(name)).toBeVisible();

    // And it survives a fresh page load, proving it was persisted.
    await page.reload();
    await expect(page.getByText(name)).toBeVisible();
  });

  test('the duplicate guard blocks a second location on the same spot', async ({ page }) => {
    await page.goto('/locations/new');
    await page.getByLabel('Name', { exact: false }).first().fill('Duplicate Of Green Residency');
    await page.getByLabel('Address').fill('12 Tilak Rd, Tirupati');
    // Exactly the seeded Green Residency coordinates.
    await page.getByLabel('Latitude').fill('13.6288');
    await page.getByLabel('Longitude').fill('79.4192');
    await page.getByRole('button', { name: 'Create location' }).click();

    await expect(page.getByTestId('form-error')).toContainText('Possible duplicate');
    await expect(page).toHaveURL(/\/locations\/new$/);
  });

  test('invalid coordinates are rejected rather than saved', async ({ page }) => {
    await page.goto('/locations/new');
    await page.getByLabel('Name', { exact: false }).first().fill('Bad Coordinates');
    await page.getByLabel('Address').fill('Nowhere');
    await page.getByLabel('Latitude').fill('999');
    await page.getByLabel('Longitude').fill('999');
    await page.getByRole('button', { name: 'Create location' }).click();

    await expect(page.getByTestId('form-error')).toContainText('must be valid');
  });

  test('pausing a location moves it out of the active list', async ({ page }) => {
    await page.goto('/locations');
    const row = page.locator('tr', { hasText: 'Srinivasa Heights' });

    // Pause is a <details> disclosure, so open it then confirm inside.
    await row.locator('summary', { hasText: 'Pause' }).click();
    await row.getByRole('button', { name: 'Confirm pause' }).click();

    await expect(page.getByText('Srinivasa Heights')).toHaveCount(0);

    // Restore it so the test is idempotent.
    await page.getByLabel('Status').selectOption('PAUSED');
    await page.getByRole('button', { name: 'Apply' }).click();
    await page
      .locator('tr', { hasText: 'Srinivasa Heights' })
      .getByRole('button', { name: 'Restore' })
      .click();
    await expect(page.getByText('Srinivasa Heights')).toHaveCount(0);
  });

  test('cancelling a location requires a reason', async ({ page }) => {
    await page.goto('/locations');
    const row = page.locator('tr', { hasText: 'Tirumala Residency' });
    await row.locator('summary', { hasText: 'Cancel' }).click();

    // The reason select is required, so submitting without one must not proceed.
    await row.getByRole('button', { name: 'Confirm removal' }).click();
    await expect(page.getByText('Tirumala Residency')).toBeVisible();
  });
});
