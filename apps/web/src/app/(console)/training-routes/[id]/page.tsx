import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { currentUserWith } from '@/lib/permissions';
import { generateRouteFromSessionAction } from '@/lib/recording-actions';
import { signedPhotoUrl } from '@/lib/storage';
import ActionForm from '@/components/ActionForm';
import LiveMap, { type MapMarker } from '@/components/Map';
import { PageHeader, Card, MetricStrip, Badge, EmptyState, Notice, when, metres, duration } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function TrainingSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ finished?: string }>;
}) {
  const { user, can } = await currentUserWith(['create_routes']);
  const { id } = await params;
  const { finished } = await searchParams;

  const session = await db.trainingSession.findUnique({
    where: { id },
    include: {
      mentor: true,
      trainee: true,
      checkpoints: { orderBy: { sequence: 'asc' } },
    },
  });

  if (!session) notFound();

  // Signed URLs are minted per request and expire — a photo of someone's front
  // door should not sit behind a permanent public link.
  const photos = await Promise.all(
    session.checkpoints.map((c) => signedPhotoUrl(c.photoUrl)),
  );

  const track: number[][] = session.geometry ? JSON.parse(session.geometry) : [];

  const markers: MapMarker[] = session.checkpoints.map((c) => ({
    id: c.id,
    lat: c.latitude,
    lng: c.longitude,
    name: c.name,
    sequence: c.sequence,
    state: c.completedAt ? 'completed' : 'remaining',
    subtitle: c.address,
  }));

  const delivered = session.checkpoints.filter((c) => c.completedAt).length;

  return (
    <>
      <PageHeader
        eyebrow="Recorded round"
        title={session.routeName}
        subtitle={`Recorded by ${session.trainee.firstName} ${session.trainee.lastName}${
          session.mentorId !== session.traineeId
            ? `, riding with ${session.mentor.firstName} ${session.mentor.lastName}`
            : ''
        } on ${when(session.startedAt)}`}
        actions={
          <Link
            href="/training-routes"
            className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
          >
            All rounds
          </Link>
        }
      />

      {finished && (
        <Notice>
          <strong className="font-semibold">Round saved.</strong> Turn it into a delivery route
          below and it will be waiting for you tomorrow.
        </Notice>
      )}

      <MetricStrip
        items={[
          { label: 'Houses', value: String(session.checkpoints.length) },
          { label: 'Delivered', value: String(delivered), tone: 'positive' },
          { label: 'Distance', value: metres(session.distance) },
          { label: 'Time', value: duration(session.duration) },
        ]}
      />

      {/* Turning the recording into a route is the whole point of day one. */}
      <Card
        title="Use this round as a delivery route"
        description="Creates a permanent delivery location for every house, then optimises the order."
      >
        <div className="p-5">
          {session.generatedRouteId ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge>APPROVED</Badge>
              <p className="text-sm text-ink-dim">
                A route has already been generated from this round.
              </p>
              <Link
                href={`/routes/${session.generatedRouteId}`}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
              >
                Open the route
              </Link>
            </div>
          ) : session.checkpoints.length === 0 ? (
            <p className="text-sm text-ink-dim">
              This round has no checkpoints, so there is nothing to turn into a route.
            </p>
          ) : !can.create_routes ? (
            <p className="text-sm text-ink-dim">
              Your role cannot create routes. An administrator can generate one from this round, or
              enable the permission under Settings.
            </p>
          ) : (
            <div className="max-w-md">
              <ActionForm
                action={generateRouteFromSessionAction}
                submitLabel={`Create route from ${session.checkpoints.length} houses`}
                pendingLabel="Building route…"
              >
                <input type="hidden" name="sessionId" value={session.id} />
                <p className="text-sm text-ink-dim">
                  Houses within 40 m of an existing location are reused rather than duplicated.
                </p>
              </ActionForm>
            </div>
          )}
        </div>
      </Card>

      <Card title="The round you drove" description="Recorded GPS track with each house marked.">
        <div className="h-96 p-4">
          {track.length > 1 || markers.length > 0 ? (
            <LiveMap markers={markers} routeGeometry={track.length > 1 ? track : null} />
          ) : (
            <EmptyState
              message="No GPS track was recorded."
              hint="Location permission may have been refused during the round."
            />
          )}
        </div>
      </Card>

      <Card title={`Houses (${session.checkpoints.length})`}>
        {session.checkpoints.length === 0 ? (
          <EmptyState message="No checkpoints were logged in this round." />
        ) : (
          <ul className="divide-y divide-line/70">
            {session.checkpoints.map((c, i) => (
              <li key={c.id} className="flex flex-col gap-4 p-5 sm:flex-row">
                {photos[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed
                  // URLs are short-lived and per-request, so they cannot be
                  // fed to the Image optimiser's static loader.
                  <img
                    src={photos[i] as string}
                    alt={`Photo of ${c.name}`}
                    className="h-28 w-full shrink-0 rounded-lg object-cover ring-1 ring-inset ring-line sm:w-40"
                  />
                ) : (
                  <div className="flex h-28 w-full shrink-0 items-center justify-center rounded-lg border border-dashed border-line-bright text-xs text-ink-faint sm:w-40">
                    No photo
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="numeric flex h-6 w-6 items-center justify-center rounded-md bg-panel-2 text-xs font-semibold text-ink-dim ring-1 ring-inset ring-line-bright">
                      {c.sequence}
                    </span>
                    <h3 className="text-sm font-semibold text-ink">{c.name}</h3>
                    {c.completedAt ? <Badge>DELIVERED</Badge> : <Badge>PENDING</Badge>}
                  </div>

                  <p className="mt-1.5 text-sm text-ink-dim">{c.address}</p>
                  <p className="numeric mt-0.5 text-xs text-ink-faint">
                    {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
                    {[c.floor && ` · Floor ${c.floor}`, c.unit && ` · Unit ${c.unit}`]
                      .filter(Boolean)
                      .join('')}
                  </p>

                  <p className="mt-2 text-sm text-ink">
                    {[c.deliveryType, c.quantity != null ? `× ${c.quantity}` : null]
                      .filter(Boolean)
                      .join(' ') || 'No package type recorded'}
                  </p>

                  {c.notes && <p className="mt-2 text-sm text-ink-dim">{c.notes}</p>}
                  {c.entranceInstructions && (
                    <p className="mt-1 text-sm text-ink-dim">Entrance: {c.entranceInstructions}</p>
                  )}
                  {c.nextVisitNote && (
                    <p className="mt-2 rounded-md bg-warn-dim/50 px-3 py-2 text-sm text-ink ring-1 ring-inset ring-warn/25">
                      Next visit: {c.nextVisitNote}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {user.role === 'ADMIN' && (
        <p className="text-sm text-ink-dim">
          Photos are served through signed URLs that expire after an hour, from a private storage
          bucket.
        </p>
      )}
    </>
  );
}
