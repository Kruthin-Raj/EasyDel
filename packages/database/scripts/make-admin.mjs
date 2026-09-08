#!/usr/bin/env node
/**
 * Promotes an existing account to ADMIN.
 *
 *   pnpm --filter @delivery/database db:make-admin you@example.com
 *
 * Self-signup deliberately creates a DELIVERY_AGENT, so there is no way to
 * make the *first* administrator from the UI. This is that step.
 *
 * Non-destructive: it only changes one user's role, and it refuses if the
 * account does not exist rather than creating one — a typo should not silently
 * mint an administrator. Sign up through the site first, verify the emailed
 * code, then run this.
 *
 * The promotion is written to the audit log, attributed to the user themselves,
 * so the change is not invisible after the fact.
 */

import { PrismaClient } from '@prisma/client';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

const email = (process.argv[2] ?? '').trim().toLowerCase();

if (!email || !email.includes('@')) {
  console.error(`
${RED}Give the email address of the account to promote.${OFF}

  pnpm --filter @delivery/database db:make-admin you@example.com
`);
  process.exit(1);
}

const db = new PrismaClient();

const user = await db.user.findUnique({
  where: { email },
  select: { id: true, role: true, firstName: true, lastName: true, emailVerified: true },
});

if (!user) {
  const count = await db.user.count();
  console.error(`
${RED}No account for ${email}.${OFF}

  There ${count === 1 ? 'is' : 'are'} ${count} account${count === 1 ? '' : 's'} in this database.
  ${DIM}Sign up at /signup first, verify the 6-digit code, then re-run this.${OFF}
`);
  await db.$disconnect();
  process.exit(1);
}

if (user.role === 'ADMIN') {
  console.log(`${GREEN}${email} is already an ADMIN.${OFF}`);
  await db.$disconnect();
  process.exit(0);
}

await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });

await db.auditLog.create({
  data: {
    userId: user.id,
    action: 'USER_ROLE_CHANGED',
    entityType: 'User',
    entityId: user.id,
    oldValue: user.role,
    newValue: 'ADMIN',
    reason: 'Promoted via db:make-admin',
  },
});

console.log(`
${GREEN}${email} is now an ADMIN.${OFF} ${DIM}(was ${user.role})${OFF}

  ${user.emailVerified ? '' : `${RED}Note: this email is not verified yet — verify it before signing in.${OFF}`}
  Sign out and back in for the new role to take effect.
`);

await db.$disconnect();
