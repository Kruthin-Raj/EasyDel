import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import ConsoleShell from '@/components/ConsoleShell';
import { allowedNavHrefs } from '@/lib/nav';

/**
 * Console shell. Every page inside this group requires a verified session, so
 * the check happens once here rather than in each page.
 *
 * This redirect is a convenience, not the security boundary — that lives in
 * requireUser()/requireAdmin() inside each Server Action, which is what a
 * direct POST hits.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  // Destinations this user can actually open. Resolved here, on the server,
  // because it reads the Settings table.
  const allowedNav = await allowedNavHrefs(user);

  // The responsive frame (static rail on desktop, drawer on mobile) lives in
  // ConsoleShell, which needs client-side state.
  return (
    <ConsoleShell user={user} allowedNav={allowedNav}>
      {children}
    </ConsoleShell>
  );
}
