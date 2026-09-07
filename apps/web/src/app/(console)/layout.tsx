import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';

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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        <div className="stagger mx-auto max-w-[100rem] space-y-6 p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
