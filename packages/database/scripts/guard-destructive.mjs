#!/usr/bin/env node
/**
 * Refuses to run a destructive Prisma command against a non-local database.
 *
 * Why this exists
 * ---------------
 * This repo has one `.env`, and its DATABASE_URL/DIRECT_URL point at the live
 * Supabase project. There is no separate development database. That means every
 * Prisma command typed on a laptop hits production, and several of them destroy
 * data without a second thought:
 *
 *   prisma migrate dev            resets the schema when it detects drift
 *   prisma db push                drops columns/tables to match the datamodel
 *   prisma migrate reset          drops everything, by design
 *   --shadow-database-url <prod>  wipes the "shadow" DB and replays migrations
 *                                 into it — catastrophic if it is production
 *
 * The last one is not hypothetical: pointing --shadow-database-url at the
 * production URL destroyed every row in this database on 8 Sept 2026. The
 * schema survived, so nothing looked broken until someone tried to sign in.
 *
 * To add a column safely, use `pnpm db:migrate:new` (read-only introspection,
 * no shadow database) and then `pnpm db:deploy`.
 *
 * Override for a genuinely disposable database:
 *   ALLOW_DESTRUCTIVE_DB=yes pnpm db:migrate
 */

const label = process.argv[2] ?? 'this command';

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

const url = process.env.DIRECT_URL || process.env.DATABASE_URL || '';

if (!url) {
  console.error(`${RED}No DATABASE_URL/DIRECT_URL set — refusing to run ${label}.${OFF}`);
  process.exit(1);
}

/** Host only. Never print the URL: it carries the database password. */
function hostOf(connectionString) {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return '(unparseable)';
  }
}

const host = hostOf(url);
const isLocal =
  host === 'localhost' ||
  host === '127.0.0.1' ||
  host === '::1' ||
  host === 'host.docker.internal' ||
  host.endsWith('.local');

if (isLocal) process.exit(0);

if (process.env.ALLOW_DESTRUCTIVE_DB === 'yes') {
  console.warn(
    `${YELLOW}ALLOW_DESTRUCTIVE_DB=yes — running ${label} against ${host}.${OFF}`,
  );
  process.exit(0);
}

console.error(`
${RED}Refusing to run ${label}.${OFF}

  Target host : ${host}
  That is not a local database, and ${label} can destroy every row in it.

${YELLOW}To add or change a column on a deployed database:${OFF}

  pnpm --filter @delivery/database db:migrate:new  <name>   ${DIM}# writes the SQL${OFF}
  ${DIM}# read the generated migration.sql, then:${OFF}
  pnpm --filter @delivery/database db:deploy                ${DIM}# applies it${OFF}

  db:migrate:new only introspects; it never resets and never needs a shadow
  database. db:deploy only moves forward.

${DIM}If this really is a disposable database, re-run with ALLOW_DESTRUCTIVE_DB=yes.${OFF}
`);
process.exit(1);
