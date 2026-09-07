import Link from 'next/link';
import { currentUserWith, parseCheckpointTypes } from '@/lib/permissions';
import { db } from '@/lib/db';
import {
  parseLinksAction,
  createRouteFromLinksAction,
  addLinksToRouteAction,
} from '@/lib/route-import-actions';
import LinkRouteBuilder from '@/components/LinkRouteBuilder';
import Forbidden from '@/components/Forbidden';
import { PageHeader, Notice } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Route from map links — EasyDel' };

export default async function RouteFromLinksPage() {
  const { user, can, settings } = await currentUserWith(['import_map_links', 'create_routes']);

  if (!can.import_map_links || !can.create_routes) {
    return (
      <Forbidden
        title="Building routes from map links is turned off for your role"
        reason="An administrator has disabled pasting map links, or route creation, for delivery agents."
        role={user.role}
        hint="They can enable it under Settings → Delivery agent permissions."
      />
    );
  }

  // Only routes this person may reshape: their own, or anything when admin.
  const driverProfile = await db.driverProfile.findUnique({ where: { userId: user.id } });
  const routes = await db.route.findMany({
    where:
      user.role === 'ADMIN'
        ? {}
        : {
            OR: [
              { createdById: user.id },
              ...(driverProfile ? [{ driverId: driverProfile.id }] : []),
            ],
          },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: { _count: { select: { stops: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const existingRoutes = routes.map((r) => ({
    id: r.id,
    name: r.name,
    stopCount: r.versions[0]?._count.stops ?? 0,
  }));

  return (
    <>
      <PageHeader
        eyebrow="New route"
        title="Build a route from map links"
        subtitle="Share each house from Google Maps, paste the links here, and get an optimised round trip back."
        actions={
          <Link
            href="/routes"
            className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
          >
            All routes
          </Link>
        }
      />

      <Notice>
        <strong className="font-semibold">Getting a link.</strong> In Google Maps, long-press the
        house → <em>Share</em> → <em>Copy link</em>. Short <code className="font-mono">goo.gl</code>{' '}
        links are expanded automatically. Photos and delivery notes are added when you visit the
        house on the round.
      </Notice>

      <div className="max-w-4xl">
        <LinkRouteBuilder
          parseAction={parseLinksAction}
          createAction={createRouteFromLinksAction}
          appendAction={addLinksToRouteAction}
          deliveryTypes={parseCheckpointTypes(settings)}
          existingRoutes={existingRoutes}
        />
      </div>
    </>
  );
}
