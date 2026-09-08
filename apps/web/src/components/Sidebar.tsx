'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Radar,
  Building2,
  Route as RouteIcon,
  Users,
  GraduationCap,
  Upload,
  History,
  BarChart3,
  Sliders,
  LogOut,
  Smartphone,
  CircleDot,
  Link2,
} from 'lucide-react';
import { logoutAction } from '@/lib/auth-actions';

/*
 * Navigation is grouped by what the operator is doing, not alphabetically:
 * what's happening now, what it runs on, who runs it, then the back office.
 * An eleven-item flat list is a wall; four short groups can be scanned.
 */
const GROUPS: { label: string; items: { name: string; href: string; icon: typeof Radar }[] }[] = [
  {
    label: 'Operations',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Record a route', href: '/record', icon: CircleDot },
      { name: 'Live tracking', href: '/live', icon: Radar },
    ],
  },
  {
    label: 'Network',
    items: [
      { name: 'Locations', href: '/locations', icon: Building2 },
      { name: 'Routes', href: '/routes', icon: RouteIcon },
      { name: 'Route from links', href: '/routes/from-links', icon: Link2 },
      { name: 'Imports', href: '/imports', icon: Upload },
    ],
  },
  {
    label: 'People',
    items: [
      { name: 'Drivers', href: '/drivers', icon: Users },
      { name: 'Mentors', href: '/mentors', icon: GraduationCap },
      { name: 'Training routes', href: '/training-routes', icon: GraduationCap },
    ],
  },
  {
    label: 'Records',
    items: [
      { name: 'Delivery history', href: '/delivery-history', icon: History },
      { name: 'Reports', href: '/reports', icon: BarChart3 },
      { name: 'Settings', href: '/settings', icon: Sliders },
    ],
  },
];

export default function Sidebar({
  user,
  allowedNav,
  onNavigate,
}: {
  user: { email: string; firstName: string; lastName: string; role: string };
  /**
   * Destinations this user may open, resolved on the server by `allowedNavHrefs`.
   * Anything absent is not rendered — an agent used to see "Drivers", tap it,
   * and hit a page that refused them.
   */
  allowedNav: string[];
  /**
   * Called when the operator picks a destination. Set by the mobile drawer so
   * it closes itself; undefined for the static desktop rail, which never needs
   * dismissing.
   */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  // Drop forbidden items, then drop any group left with nothing in it.
  const allowed = new Set(allowedNav);
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.has(item.href)),
  })).filter((group) => group.items.length > 0);

  /*
   * Only the most specific match highlights. A plain startsWith would light up
   * both "Routes" and "Route from links" on /routes/from-links, so the longest
   * matching href wins.
   */
  const activeHref = groups
    .flatMap((g) => g.items)
    .map((item) => item.href)
    .filter((href) => (href === '/' ? pathname === '/' : pathname.startsWith(href)))
    .sort((a, b) => b.length - a.length)[0];
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() || '?';

  return (
    <nav
      aria-label="Main"
      className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-surface-2"
    >
      <div className="flex items-baseline gap-2 px-5 py-5">
        <span className="text-base font-semibold tracking-tight text-ink">EasyDel</span>
        <span className="eyebrow text-accent">v1</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="eyebrow px-3 pb-2 text-ink-faint">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.href === activeHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? 'page' : undefined}
                      // min-h-11 gives a 44px touch target on the drawer, the
                      // minimum both Apple and Google specify. The desktop rail
                      // is pointer-driven and stays compact.
                      className={`group relative flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors lg:min-h-0 ${
                        isActive
                          ? 'bg-panel-2 font-medium text-ink'
                          : 'text-ink-dim hover:bg-panel/70 hover:text-ink'
                      }`}
                    >
                      {/* Amber marker on the active item — the accent's one job
                          in the nav, so "where am I" is unambiguous. */}
                      <span
                        aria-hidden
                        className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent transition-opacity ${
                          isActive ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <item.icon
                        className={`h-4 w-4 shrink-0 transition-colors ${
                          isActive ? 'text-accent' : 'text-ink-faint group-hover:text-ink-dim'
                        }`}
                        aria-hidden
                      />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line p-3">
        <Link
          href="/download-app"
          onClick={onNavigate}
          className="mb-2 flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-dim transition-colors hover:bg-panel-2 hover:text-ink lg:min-h-0"
        >
          <Smartphone className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
          <span>Agent app</span>
        </Link>

        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
          <span className="numeric flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-dim/50 text-xs font-semibold text-accent ring-1 ring-inset ring-accent/30">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">
              {user.firstName} {user.lastName}
            </span>
            <span className="eyebrow block truncate text-ink-faint">
              {user.role.replace(/_/g, ' ')}
            </span>
          </span>
        </div>

        <form action={logoutAction}>
          <button
            type="submit"
            className="mt-1 flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-dim transition-colors hover:bg-panel-2 hover:text-ink lg:min-h-0"
          >
            <LogOut className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </nav>
  );
}
