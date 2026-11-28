import Link from 'next/link';
import { BookOpen, Copy, Play, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { normalizeShareInput } from '@/lib/share-code';
import { duplicateRouteAction, saveRouteAction, saveSharedLocationAction } from '@/lib/share-actions';
import { signedPhotoUrl } from '@/lib/storage';
import LiveMap, { type MapMarker } from '@/components/Map';
import JoinRouteForm from '@/components/JoinRouteForm';
import ActionForm from '@/components/ActionForm';
import {
  PageHeader,
  Card,
  MetricStrip,
  Table,
  Td,
  Badge,
  EmptyState,
  Notice,
  when,
  metres,
  duration,
} from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shared route — EasyDel' };

export default async function SharedRoutePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const user = await requireUser();
  const { code: rawCode } = await params;
  const code = normalizeShareInput(decodeURIComponent(rawCode)) ?? rawCode.trim().toUpperCase();

  const route = await db.route.findUnique({
    where: { shareCode: code },
    include: {
      createdBy: true,
      savedBy: { where: { userId: user.id }, select: { id: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: {
          stops: {
            orderBy: { sequence: 'asc' },
            include: {
              deliveryLocation: {
                include: { subscriptions: { where: { status: 'ACTIVE' } } },
              },
            },
          },
        },
      },
    },
  });

  if (!route) {
    const sharedLocation = await db.deliveryLocation.findUnique({
      where: { shareCode: code },
      include: {
        createdBy: true,
        subscriptions: { where: { status: 'ACTIVE' } },
      },
    });

    if (sharedLocation) {
      const isLocOwner = sharedLocation.createdById === user.id;
      const [photoUrl, myEditableRoutes] = await Promise.all([
        sharedLocation.photo ? signedPhotoUrl(sharedLocation.photo) : Promise.resolve(null),
        db.route.findMany({
          where: { createdById: user.id, status: { not: 'ARCHIVED' } },
          select: { id: true, name: true },
          orderBy: { updatedAt: 'desc' },
          take: 50,
        }),
      ]);

      const locMarkers: MapMarker[] = [
        {
          id: sharedLocation.id,
          lat: sharedLocation.latitude,
          lng: sharedLocation.longitude,
          name: sharedLocation.name,
          sequence: 1,
          state: 'remaining',
          subtitle: sharedLocation.address,
        },
      ];

      return (
        <>
          <PageHeader
            eyebrow={`Shared location · ${sharedLocation.shareCode ?? code}`}
            title={sharedLocation.name}
            subtitle={
              sharedLocation.createdBy
                ? `Shared by ${sharedLocation.createdBy.firstName} ${sharedLocation.createdBy.lastName}`
                : 'Shared delivery stop'
            }
            actions={
              <Link
                href="/locations"
                className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
              >
                My locations
              </Link>
            }
          />

          {sharedLocation.status === 'ARCHIVED' && (
            <Notice tone="warning">
              This location has been archived by its creator and can no longer be imported.
            </Notice>
          )}

          {isLocOwner && (
            <div className="flex items-center gap-2 rounded-lg bg-ok-dim/50 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-ok/30">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden />
              <span>This is already one of your saved locations.</span>
            </div>
          )}

          {sharedLocation.status !== 'ARCHIVED' && (
            <Card
              title={isLocOwner ? 'Add this location to a route' : 'Save to my locations'}
              description="Copies the pin, house photo, instructions, and delivery items into your own list."
            >
              <div className="p-5">
                <ActionForm
                  action={saveSharedLocationAction}
                  submitLabel={isLocOwner ? 'Add to selected route' : 'Save location'}
                  pendingLabel="Saving…"
                >
                  <input type="hidden" name="locationId" value={sharedLocation.id} />
                  <input type="hidden" name="code" value={sharedLocation.shareCode ?? code} />

                  {myEditableRoutes.length > 0 && (
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-ink">
                        Also add to route {isLocOwner ? '' : '(optional)'}
                      </span>
                      <select
                        name="routeId"
                        required={isLocOwner}
                        defaultValue=""
                        className="field"
                      >
                        <option value="">
                          {isLocOwner ? 'Choose a route…' : 'Save to locations only'}
                        </option>
                        {myEditableRoutes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </ActionForm>
              </div>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Map pin">
              <div className="h-72 p-4">
                <LiveMap markers={locMarkers} routeGeometry={null} />
              </div>
            </Card>

            <Card title="Stop details">
              <div className="space-y-3 p-5 text-sm">
                {photoUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={photoUrl}
                    alt={`Photo of ${sharedLocation.name}`}
                    className="h-44 w-full rounded-lg object-cover ring-1 ring-line"
                  />
                )}
                <p className="text-ink-dim">{sharedLocation.address}</p>
                {(sharedLocation.floor || sharedLocation.unit) && (
                  <p className="text-ink">
                    {[
                      sharedLocation.floor && `Floor ${sharedLocation.floor}`,
                      sharedLocation.unit && `Unit ${sharedLocation.unit}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {sharedLocation.entranceInstructions && (
                  <p className="text-ink">
                    <span className="font-medium text-accent">Entrance:</span>{' '}
                    {sharedLocation.entranceInstructions}
                  </p>
                )}
                {sharedLocation.securityInstructions && (
                  <p className="text-ink">
                    <span className="font-medium text-accent">Security:</span>{' '}
                    {sharedLocation.securityInstructions}
                  </p>
                )}
                {sharedLocation.notes && <p className="text-ink-dim">{sharedLocation.notes}</p>}
                {sharedLocation.subscriptions.length > 0 && (
                  <div className="pt-2">
                    <p className="eyebrow mb-1 text-ink-faint">Items</p>
                    <p className="text-xs text-ink-dim">
                      {sharedLocation.subscriptions
                        .map((s) => `${s.productType} ×${s.quantity}`)
                        .join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      );
    }

    return (
      <>
        <PageHeader
          eyebrow="Shared code"
          title="Route or location not found"
          subtitle={`We could not find a route or location matching code “${code}”.`}
          actions={
            <Link
              href="/routes"
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              My routes
            </Link>
          }
        />
        <div className="max-w-2xl space-y-4">
          <Notice tone="warning">
            Check the 8-letter code or paste the full share link again below.
          </Notice>
          <JoinRouteForm title="Try another route or location code" />
        </div>
      </>
    );
  }

  const isOwner = route.createdById === user.id;
  const isSaved = route.savedBy.length > 0;
  const hasInMyRoutes = isOwner || isSaved;
  const latest = route.versions[0];

  const geometry: number[][] | null = latest?.routeGeometry
    ? (() => {
        try {
          const parsed = JSON.parse(latest.routeGeometry);
          return Array.isArray(parsed?.coordinates) ? (parsed.coordinates as number[][]) : null;
        } catch {
          return null;
        }
      })()
    : null;

  const markers: MapMarker[] = [];
  if (latest?.startLatitude != null && latest.startLongitude != null) {
    markers.push({
      id: 'start',
      lat: latest.startLatitude,
      lng: latest.startLongitude,
      name: latest.startLocationName ?? 'Start',
      state: 'start',
    });
  }
  latest?.stops.forEach((s) => {
    markers.push({
      id: s.id,
      lat: s.deliveryLocation.latitude,
      lng: s.deliveryLocation.longitude,
      name: s.deliveryLocation.name,
      sequence: s.sequence,
      state: 'remaining',
      subtitle: s.deliveryLocation.address,
    });
  });
  if (latest?.endLatitude != null && latest.endLongitude != null) {
    markers.push({
      id: 'end',
      lat: latest.endLatitude,
      lng: latest.endLongitude,
      name: latest.endLocationName ?? 'End',
      state: 'end',
    });
  }

  const stopsWithPhotos = latest
    ? await Promise.all(
        latest.stops.map(async (s) => ({
          ...s,
          resolvedPhotoUrl: s.deliveryLocation.photo
            ? await signedPhotoUrl(s.deliveryLocation.photo)
            : null,
        })),
      )
    : [];

  return (
    <>
      <PageHeader
        eyebrow={`Shared route · ${route.shareCode}`}
        title={route.name}
        subtitle={`Created by ${route.createdBy.firstName} ${route.createdBy.lastName} · ${when(route.createdAt)}`}
        actions={
          hasInMyRoutes ? (
            <>
              <Link
                href={`/routes/${route.id}/memorize`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
              >
                <BookOpen className="h-4 w-4" aria-hidden />
                Memorize route
              </Link>
              <Link
                href={`/routes/${route.id}/run`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
              >
                <Play className="h-4 w-4" aria-hidden />
                Deliver now
              </Link>
              <Link
                href={`/routes/${route.id}`}
                className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
              >
                Open route
              </Link>
            </>
          ) : (
            <Link
              href="/routes"
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              My routes
            </Link>
          )
        }
      />

      {route.status === 'ARCHIVED' && (
        <Notice tone="warning">
          This route has been archived by its creator and can no longer be saved or run.
        </Notice>
      )}

      {hasInMyRoutes && (
        <div className="flex items-center gap-2 rounded-lg bg-ok-dim/50 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-ok/30">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden />
          <span>
            {isOwner
              ? 'You created this route — it is already in your routes.'
              : 'This route is saved in your routes. You can memorize the stops or start delivering whenever you are ready.'}
          </span>
        </div>
      )}

      <MetricStrip
        items={[
          { label: 'Stops', value: String(latest?.stops.length ?? 0) },
          { label: 'Distance', value: metres(latest?.totalDistance) },
          { label: 'Est. time', value: duration(latest?.estimatedDuration) },
          { label: 'Share code', value: route.shareCode ?? code, tone: 'accent' },
        ]}
      />

      {route.status !== 'ARCHIVED' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {!hasInMyRoutes && (
            <Card
              title="Save to my routes"
              description="Adds this route to your My routes list so you can memorize every stop and run deliveries. Updates made by the creator stay in sync."
            >
              <div className="p-5">
                <ActionForm
                  action={saveRouteAction}
                  submitLabel="Save to my routes"
                  pendingLabel="Saving…"
                >
                  <input type="hidden" name="routeId" value={route.id} />
                  <input type="hidden" name="code" value={route.shareCode ?? code} />
                </ActionForm>
              </div>
            </Card>
          )}

          <Card
            title={hasInMyRoutes ? 'Make your own editable copy' : 'Or clone as your own route'}
            description="Creates an independent copy under your name with its own share code, so you can add, remove, or reorder stops yourself."
          >
            <div className="p-5">
              <ActionForm
                action={duplicateRouteAction}
                submitLabel="Duplicate to my routes"
                pendingLabel="Copying…"
              >
                <input type="hidden" name="routeId" value={route.id} />
                <input type="hidden" name="shareCode" value={route.shareCode ?? code} />
                <p className="flex items-center gap-2 text-xs text-ink-dim">
                  <Copy className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                  Your copy starts at v1 with all {latest?.stops.length ?? 0} stops.
                </p>
              </ActionForm>
            </div>
          </Card>
        </div>
      )}

      <Card title="Route overview" description="Numbered stops in delivery order.">
        <div className="h-80 p-4 sm:h-96">
          <LiveMap markers={markers} routeGeometry={geometry} />
        </div>
      </Card>

      <Card title={`Stops in order (${stopsWithPhotos.length})`}>
        {stopsWithPhotos.length === 0 ? (
          <EmptyState message="This route has no stops yet." />
        ) : (
          <Table head={['#', 'Location & instructions', 'What to deliver', 'Status']}>
            {stopsWithPhotos.map((s) => {
              const active = s.deliveryLocation.subscriptions.filter((x) => x.status === 'ACTIVE');
              const qty = active.reduce((sum, x) => sum + x.quantity, 0);
              return (
                <tr key={s.id} className="align-top hover:bg-panel-2/60">
                  <Td className="numeric font-medium text-ink">{s.sequence}</Td>
                  <Td>
                    <p className="font-medium text-ink">{s.deliveryLocation.name}</p>
                    <p className="text-xs text-ink-dim">{s.deliveryLocation.address}</p>
                    {s.deliveryLocation.entranceInstructions && (
                      <p className="mt-1 text-xs text-ink">
                        Entrance: {s.deliveryLocation.entranceInstructions}
                      </p>
                    )}
                    {s.deliveryLocation.notes && (
                      <p className="mt-0.5 text-xs text-ink-dim">{s.deliveryLocation.notes}</p>
                    )}
                    {s.resolvedPhotoUrl && (
                      <div className="mt-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.resolvedPhotoUrl}
                          alt={`Photo of ${s.deliveryLocation.name}`}
                          className="h-20 w-auto rounded-md object-cover ring-1 ring-line"
                        />
                      </div>
                    )}
                  </Td>
                  <Td className="text-ink">
                    {qty} item{qty === 1 ? '' : 's'}
                    <p className="text-xs text-ink-dim">
                      {active
                        .map((x) => `${x.customerId ?? 'Customer'} · ${x.productType} ×${x.quantity}`)
                        .join(', ') || '—'}
                    </p>
                  </Td>
                  <Td>
                    <Badge>{s.deliveryLocation.status}</Badge>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
