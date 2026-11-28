import Link from 'next/link';
import { BookOpen, CircleDot, Link2, ListPlus, MapPin, Play } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { deliveryWhere, locationWhere, routeWhere } from '@/lib/scope';
import { ensureRouteShareCode } from '@/lib/route-sharing';
import JoinRouteForm from '@/components/JoinRouteForm';
import {
  PageHeader,
  StatCard,
  Card,
  Table,
  Td,
  Badge,
  when,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();

  const dScope = deliveryWhere(user);
  const rScope = await routeWhere(user);
  const lScope = locationWhere(user);

  const [
    myRoutesCount,
    locationsCount,
    delivered,
    savedSharedCount,
    activeRun,
    rawQuickRoutes,
    recentDeliveries,
  ] = await Promise.all([
    db.route.count({ where: { ...rScope, status: { not: 'ARCHIVED' } } }),
    db.deliveryLocation.count({ where: { ...lScope, status: 'ACTIVE' } }),
    db.delivery.count({ where: { ...dScope, status: 'DELIVERED' } }),
    db.savedRoute.count({ where: { userId: user.id } }),
    db.routeRun.findFirst({
      where: { driverId: user.id, status: 'IN_PROGRESS' },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        routeVersion: {
          select: {
            routeId: true,
            route: { select: { name: true } },
            _count: { select: { stops: true } },
          },
        },
        _count: { select: { deliveries: true } },
      },
    }),
    db.route.findMany({
      where: { ...rScope, status: { not: 'ARCHIVED' } },
      orderBy: { updatedAt: 'desc' },
      take: 4,
      select: {
        id: true,
        name: true,
        shareCode: true,
        createdById: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: { _count: { select: { stops: true } } },
        },
      },
    }),
    db.delivery.findMany({
      where: dScope,
      take: 5,
      orderBy: { updatedAt: 'desc' },
      include: { subscription: { include: { deliveryLocation: true } } },
    }),
  ]);

  const quickRoutes = await Promise.all(
    rawQuickRoutes.map(async (r) => ({
      ...r,
      shareCode: r.shareCode ?? (await ensureRouteShareCode(r.id)),
    })),
  );

  return (
    <>
      <PageHeader
        title={`Hi, ${user.firstName}`}
        subtitle="Open a route or house with a code, or build your own in seconds."
      />

      {activeRun && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn-dim/30 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              Round in progress: {activeRun.routeVersion.route.name}
            </p>
            <p className="text-xs text-ink-dim">
              {activeRun._count.deliveries} of {activeRun.routeVersion._count.stops} stops done
            </p>
          </div>
          <Link
            href={`/routes/${activeRun.routeVersion.routeId}/run`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
          >
            <Play className="h-4 w-4" aria-hidden />
            Continue
          </Link>
        </div>
      )}

      {/* ---------------- Hero Launchpad: Code-first OR Create ---------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <JoinRouteForm
          title="Open a shared route or location"
          description="Got an 8-letter code or link? Paste it to start delivering or save a stop."
          submitLabel="Open"
        />

        <section className="rounded-xl border border-line bg-panel p-5">
          <h2 className="text-sm font-semibold text-ink">Create a route</h2>
          <p className="mt-1 text-xs text-ink-dim">
            Pick a fast way to build stops — every route gets its own share code.
          </p>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <Link
              href="/record"
              className="group flex flex-col justify-between rounded-lg border border-line bg-surface-2 p-3 transition-colors hover:border-accent/50 hover:bg-panel-2"
            >
              <CircleDot className="h-4 w-4 text-accent" aria-hidden />
              <div className="mt-2.5">
                <p className="text-sm font-semibold text-ink group-hover:text-accent">
                  Record round
                </p>
                <p className="text-xs text-ink-dim">Drive &amp; snap houses</p>
              </div>
            </Link>

            <Link
              href="/routes/from-links"
              className="group flex flex-col justify-between rounded-lg border border-line bg-surface-2 p-3 transition-colors hover:border-accent/50 hover:bg-panel-2"
            >
              <Link2 className="h-4 w-4 text-info" aria-hidden />
              <div className="mt-2.5">
                <p className="text-sm font-semibold text-ink group-hover:text-accent">
                  Map links
                </p>
                <p className="text-xs text-ink-dim">Paste Maps pins</p>
              </div>
            </Link>

            <Link
              href="/routes/new"
              className="group flex flex-col justify-between rounded-lg border border-line bg-surface-2 p-3 transition-colors hover:border-accent/50 hover:bg-panel-2"
            >
              <ListPlus className="h-4 w-4 text-ok" aria-hidden />
              <div className="mt-2.5">
                <p className="text-sm font-semibold text-ink group-hover:text-accent">
                  Pick stops
                </p>
                <p className="text-xs text-ink-dim">Use saved locations</p>
              </div>
            </Link>
          </div>
        </section>
      </div>

      {/* ---------------- Quick Launch Routes (1-click Memorize / Start) ---------------- */}
      {quickRoutes.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Ready to start</h2>
            <Link href="/routes" className="text-xs font-medium text-accent hover:underline">
              All routes ({myRoutesCount})
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickRoutes.map((r) => {
              const stops = r.versions[0]?._count.stops ?? 0;
              return (
                <div
                  key={r.id}
                  className="flex flex-col justify-between rounded-xl border border-line bg-panel p-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/routes/${r.id}`}
                        className="truncate text-sm font-semibold text-ink hover:text-accent"
                      >
                        {r.name}
                      </Link>
                      {r.shareCode && (
                        <code className="numeric shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-accent ring-1 ring-inset ring-accent/25">
                          {r.shareCode}
                        </code>
                      )}
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-xs text-ink-dim">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      {stops} stop{stops === 1 ? '' : 's'}
                      {r.createdById !== user.id ? ' · Shared' : ''}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Link
                      href={`/routes/${r.id}/memorize`}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
                    >
                      <BookOpen className="h-3.5 w-3.5" aria-hidden />
                      Memorize
                    </Link>
                    <Link
                      href={`/routes/${r.id}/run`}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden />
                      Start
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="grid gap-3 rounded-xl border border-line bg-panel/70 p-4 sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <span className="numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
              1
            </span>
            <p className="text-xs font-medium text-ink">Enter a code or create a route</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info/15 text-xs font-bold text-info">
              2
            </span>
            <p className="text-xs font-medium text-ink">Memorize photos &amp; house notes</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="numeric flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ok/15 text-xs font-bold text-ok">
              3
            </span>
            <p className="text-xs font-medium text-ink">Tap Start and mark each stop</p>
          </div>
        </div>
      )}

      {/* ---------------- Compact Glance Metrics ---------------- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="My routes" value={myRoutesCount} tone="info" href="/routes" />
        <StatCard label="Locations" value={locationsCount} href="/locations" />
        <StatCard label="Delivered" value={delivered} tone="positive" href="/delivery-history?status=DELIVERED" />
        <StatCard
          label="Saved shared"
          value={savedSharedCount}
          tone={savedSharedCount > 0 ? 'info' : 'neutral'}
          href="/share"
        />
      </div>

      {recentDeliveries.length > 0 && (
        <Card title="Recent deliveries" description="Latest updates from your runs.">
          <Table head={['Location', 'Customer', 'Qty', 'Status', 'When']}>
            {recentDeliveries.map((d) => (
              <tr key={d.id} className="hover:bg-panel-2/60">
                <Td className="font-medium text-ink">
                  {d.subscription.deliveryLocation.name}
                </Td>
                <Td>{d.subscription.customerId ?? '—'}</Td>
                <Td className="tabular-nums">{d.quantity}</Td>
                <Td>
                  <Badge>{d.status}</Badge>
                </Td>
                <Td className="whitespace-nowrap text-ink-dim">{when(d.timestamp)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
