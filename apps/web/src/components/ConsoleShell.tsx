'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';

/*
 * Console shell — the responsive frame around every signed-in page.
 *
 * The sidebar is 240px wide. On a 390px phone that is 62% of the screen, which
 * left roughly 150px for the actual content: stat labels truncated mid-word and
 * prose wrapped one word per line. So below `lg` the nav becomes an off-canvas
 * drawer behind a top bar, and the content gets the whole viewport.
 *
 * At `lg` and up nothing changes — the static rail is still the right shape for
 * a dispatch console on a desktop.
 *
 * This is a Client Component because the drawer has open/closed state. The
 * layout that renders it stays a Server Component, so the session lookup still
 * happens on the server and `user` crosses as plain serialisable data.
 */
export default function ConsoleShell({
  user,
  allowedNav,
  children,
}: {
  user: { email: string; firstName: string; lastName: string; role: string };
  /** Nav destinations this user may open; the rest are not rendered. */
  allowedNav: string[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating from inside the drawer must close it, or the destination page
  // renders underneath a still-open overlay.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape to dismiss, and lock the page behind the drawer so a scroll gesture
  // over the backdrop doesn't move the content the user can't see.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    // h-dvh, not h-screen: `vh` on mobile is the viewport with browser chrome
    // *hidden*, so h-screen leaves the last rows under the address bar.
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop: the static rail, exactly as before. */}
      <div className="hidden lg:flex">
        <Sidebar user={user} allowedNav={allowedNav} />
      </div>

      {/* Mobile: the same nav as a drawer. Kept mounted so it can animate, and
          marked `inert` when closed so its links are not tabbable or readable
          by a screen reader while off-screen. */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`}
        inert={!open}
      >
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className={`absolute inset-0 h-full w-full cursor-default bg-black/65 transition-opacity duration-200 ${
            open ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          className={`absolute inset-y-0 left-0 w-60 shadow-2xl transition-transform duration-200 ease-out ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar user={user} allowedNav={allowedNav} onNavigate={() => setOpen(false)} />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar. Sticky so the way back to the nav is always one tap
            away, however far down a route list the driver has scrolled. */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface-2/95 px-3 py-2 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            aria-expanded={open}
            className="-ml-1 inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-panel-2 hover:text-ink"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="flex items-baseline gap-2">
            <span className="text-base font-semibold tracking-tight text-ink">EasyDel</span>
            <span className="eyebrow text-accent">v1</span>
          </span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="stagger mx-auto max-w-[100rem] space-y-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:space-y-6 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
