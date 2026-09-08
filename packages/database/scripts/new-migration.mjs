#!/usr/bin/env node
/**
 * Writes a migration for whatever schema.prisma changed, safely.
 *
 *   pnpm --filter @delivery/database db:migrate:new add_some_column
 *   # read the printed SQL, then:
 *   pnpm --filter @delivery/database db:deploy
 *
 * Why not `prisma migrate dev`
 * ---------------------------
 * `migrate dev` resets the database when it finds drift, and the usual
 * workaround — `migrate diff --from-migrations --shadow-database-url <url>` —
 * wipes whatever that URL points at. With one .env pointing at production,
 * both are loaded guns. That mistake destroyed every row in this database on
 * 8 Sept 2026.
 *
 * This uses `--from-schema-datasource`, which *introspects* the live database
 * read-only and diffs it against the datamodel. No shadow database, nothing
 * dropped, nothing replayed.
 *
 * It only writes a file. Applying it is a separate, explicit `db:deploy`, and
 * the SQL is printed first so a destructive statement cannot slip through
 * unread.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRISMA_DIR = resolve(HERE, '..', 'prisma');
const SCHEMA = resolve(PRISMA_DIR, 'schema.prisma');

const rawName = (process.argv[2] ?? '').trim();
if (!rawName) {
  console.error(`
${RED}Name the migration.${OFF}

  pnpm --filter @delivery/database db:migrate:new add_some_column
`);
  process.exit(1);
}

const name = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

if (!existsSync(SCHEMA)) {
  console.error(`${RED}Cannot find ${SCHEMA}${OFF}`);
  process.exit(1);
}

console.log(`\n${DIM}Introspecting the live database (read-only)…${OFF}`);

let sql;
try {
  sql = execFileSync(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      // Compares the DATABASE the datasource points at ...
      '--from-schema-datasource',
      SCHEMA,
      // ... against the schema file's models. No shadow database involved.
      '--to-schema-datamodel',
      SCHEMA,
      '--script',
    ],
    { encoding: 'utf8', cwd: resolve(HERE, '..'), shell: process.platform === 'win32' },
  );
} catch (error) {
  console.error(`${RED}migrate diff failed:${OFF}\n${error.stdout ?? ''}${error.stderr ?? ''}`);
  process.exit(1);
}

const meaningful = sql
  .split('\n')
  .filter((line) => line.trim() && !line.trim().startsWith('--'))
  .join('\n')
  .trim();

if (!meaningful) {
  console.log(`${GREEN}The database already matches schema.prisma — nothing to migrate.${OFF}\n`);
  process.exit(0);
}

// Timestamp in Prisma's own format, so migrations sort correctly.
const stamp = new Date()
  .toISOString()
  .replace(/[-:T]/g, '')
  .slice(0, 14);
const folder = resolve(PRISMA_DIR, 'migrations', `${stamp}_${name}`);

mkdirSync(folder, { recursive: true });
writeFileSync(resolve(folder, 'migration.sql'), sql, 'utf8');

console.log(`\n${GREEN}Wrote${OFF} prisma/migrations/${stamp}_${name}/migration.sql\n`);
console.log(`${DIM}${'-'.repeat(64)}${OFF}`);
console.log(sql.trim());
console.log(`${DIM}${'-'.repeat(64)}${OFF}\n`);

// Anything that can lose data gets called out by name rather than buried.
const destructive = /\b(DROP\s+(TABLE|COLUMN|SCHEMA)|TRUNCATE|DELETE\s+FROM)\b/i;
if (destructive.test(sql)) {
  console.log(
    `${RED}This migration drops or deletes something.${OFF} Read it line by line before deploying —\n` +
      `on a live database those statements destroy real records.\n`,
  );
} else {
  console.log(`${GREEN}No DROP/TRUNCATE/DELETE — this looks additive.${OFF}\n`);
}

console.log(`${YELLOW}Apply it with:${OFF}
  pnpm --filter @delivery/database db:deploy
`);
