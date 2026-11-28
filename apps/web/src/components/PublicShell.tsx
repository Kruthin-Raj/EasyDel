import Link from 'next/link';
import { Route as RouteIcon } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { allowedNavHrefs } from '@/lib/nav';
import ConsoleShell from '@/components/ConsoleShell';

/**
 * Adaptive layout wrapper for pages accessible both before and after sign-in
 * (such as `/about` and `/contact`). Renders the full console frame when
 * signed in, or a sleek public header/footer when signed out.
 */
export default async function PublicShell({
  children,
  activePath,
}: {
  children: React.ReactNode;
  activePath: '/about' | '/contact';
}) {
  const user = await getSessionUser();

  if (user) {
    const allowedNav = await allowedNavHrefs();
    return (
      <ConsoleShell user={user} allowedNav={allowedNav}>
        {children}
      </ConsoleShell>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface-2/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/login" className="inline-flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent ring-1 ring-inset ring-accent/30">
              <RouteIcon className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-base font-semibold tracking-tight text-ink">EasyDel</span>
              <span className="eyebrow hidden text-accent sm:inline">route manager</span>
            </span>
          </Link>

          <nav aria-label="Public" className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/about"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activePath === '/about'
                  ? 'bg-panel-2 text-ink ring-1 ring-inset ring-line-bright'
                  : 'text-ink-dim hover:text-ink'
              }`}
            >
              About
            </Link>
            <Link
              href="/contact"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activePath === '/contact'
                  ? 'bg-panel-2 text-ink ring-1 ring-inset ring-line-bright'
                  : 'text-ink-dim hover:text-ink'
              }`}
            >
              Contact us
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-5 py-8 sm:px-8">
        {children}
      </main>

      <footer className="border-t border-line bg-surface-2/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 text-xs text-ink-dim sm:px-8">
          <p>EasyDel — Peer-to-peer route creation, sharing, and stop memorization.</p>
          <div className="flex items-center gap-4">
            <Link href="/about" className="hover:text-accent">
              About
            </Link>
            <Link href="/contact" className="hover:text-accent">
              Contact us
            </Link>
            <Link href="/login" className="hover:text-accent">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
