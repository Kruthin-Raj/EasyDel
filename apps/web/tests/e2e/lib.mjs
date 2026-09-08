import { chromium, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Shared plumbing for the end-to-end checks.
 *
 * These are plain scripts rather than a Playwright test suite because they run
 * against a real server and a real database, and their assertions are about
 * *absence* — that one agent cannot see another's data. A failure here is a
 * privacy bug, so each check prints what it actually observed.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, '..', '..');

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
export const TAG = 'easydel-e2e';

/** Reads apps/web/.env.local without pulling in a dotenv dependency. */
export function loadEnv() {
  const file = resolve(WEB_ROOT, '.env.local');
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
      .map((line) => [
        line.slice(0, line.indexOf('=')).trim(),
        line
          .slice(line.indexOf('=') + 1)
          .trim()
          .replace(/^["']|["']$/g, ''),
      ]),
  );
}

/** Tracks pass/fail and prints each observation. */
export function createChecker() {
  const state = { failed: 0, total: 0 };

  const check = (label, condition, detail = '') => {
    state.total += 1;
    if (!condition) state.failed += 1;
    console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  };

  const finish = async (browser) => {
    await browser.close();
    console.log(
      state.failed
        ? `\n${state.failed} of ${state.total} FAILED\n`
        : `\nall ${state.total} passed\n`,
    );
    process.exit(state.failed ? 1 : 0);
  };

  return { check, finish, state };
}

/**
 * A phone-sized context with a GPS fix.
 *
 * Location is granted because recording and running a route both refuse
 * without a fix — the buttons stay disabled and every check downstream fails
 * for the wrong reason.
 */
export async function launch() {
  const browser = await chromium.launch();
  return browser;
}

export async function phoneContext(browser) {
  return browser.newContext({
    ...devices['iPhone 13'],
    permissions: ['geolocation'],
    geolocation: { latitude: 13.6288, longitude: 79.4192, accuracy: 6 },
  });
}

export async function signIn(browser, email, password) {
  const context = await phoneContext(browser);
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(\\?.*)?$`), {
    timeout: 30000,
  });
  return page;
}

/**
 * Lowercased text of <main> only.
 *
 * Two hard-won details:
 *   - <main>, not <body>: the sidebar's own wording otherwise satisfies
 *     assertions like "the page mentions Routes".
 *   - lowercased: stat labels use text-transform:uppercase, so innerText
 *     returns "TOTAL DRIVERS" and a case-sensitive check silently passes
 *     whether the tile is present or not.
 */
export async function mainText(page) {
  return (await page.locator('main').first().innerText()).toLowerCase();
}

/** Waits for a condition instead of sleeping and hoping. */
export async function appears(locator, timeout = 30000) {
  return locator
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

export async function disappears(locator, timeout = 25000) {
  return locator
    .first()
    .waitFor({ state: 'detached', timeout })
    .then(() => true)
    .catch(() => false);
}
