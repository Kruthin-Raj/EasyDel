import { defineConfig } from 'vitest/config';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/*
 * Load .env.local so the integration tests in tokens.test.ts can reach the
 * database. Vitest does not read Next's env files on its own, and adding dotenv
 * just for this would be a dependency for six lines of parsing.
 */
function loadEnvLocal() {
  const file = resolve(here, '.env.local');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) continue;
    const key = line.slice(0, line.indexOf('=')).trim();
    const value = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

export default defineConfig({
  test: {
    environment: 'node',
    // Unit tests only. Playwright owns the browser-level tests under tests/.
    include: ['src/**/*.test.ts'],
    // tokens.test.ts shares one database, so files must not race each other.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
