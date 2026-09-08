import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { loadSettings, parseCheckpointTypes } from '@/lib/permissions';
import { abandonRecordingAction } from '@/lib/recording-actions';
import { signedPhotoUrl } from '@/lib/storage';
import RecordingConsole from '@/components/RecordingConsole';
import { readNameOptions, roundTypeOptions } from '@/lib/name-options';
import Forbidden from '@/components/Forbidden';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recording — EasyDel' };

export default async function RecordingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const session = await db.trainingSession.findUnique({
    where: { id },
    include: { checkpoints: { orderBy: { sequence: 'asc' } } },
  });

  if (!session) notFound();

  // A recording belongs to the person driving it. Admins can look, but this
  // screen is a live capture tool, not a viewer.
  const isOwner = session.recordedById === user.id || session.traineeId === user.id;
  if (!isOwner) {
    return (
      <Forbidden
        title="This is someone else’s recording"
        reason="Only the driver who started a round can add checkpoints to it."
        role={user.role}
        hint="You can review any finished round under Training routes."
      />
    );
  }

  // Finished rounds belong on the review page, not the capture screen.
  if (session.status !== 'RECORDING') redirect(`/training-routes/${session.id}`);

  const settings = await loadSettings();

  /*
   * Package types for THIS round.
   *
   * The list pasted for the round wins; failing that, any type already used at
   * a checkpoint on this round is offered again; failing that, the agent's own
   * list, then the team's, then the built-in defaults. Route-to-route rather
   * than global, because what is being carried changes per round — and because
   * the shared Settings row is one value for the whole team.
   */
  const deliveryTypes = roundTypeOptions({
    stored: session.typeOptions,
    usedOnRound: session.checkpoints.map((c) => c.deliveryType),
    fallback: parseCheckpointTypes(settings, user.id),
  });

  /*
   * The track recorded so far, handed back to the client.
   *
   * The map's trail was previously built only from positions seen since the
   * page loaded, so backgrounding the tab and returning made the recorded path
   * disappear — the geometry was safe in the database the entire time, it was
   * just never sent back. Parsed defensively: a malformed column should cost
   * the trail, not the whole recording screen.
   */
  let initialTrack: number[][] = [];
  if (session.geometry) {
    try {
      const parsed = JSON.parse(session.geometry);
      if (Array.isArray(parsed)) {
        initialTrack = parsed.filter(
          (point): point is number[] =>
            Array.isArray(point) &&
            point.length === 2 &&
            Number.isFinite(point[0]) &&
            Number.isFinite(point[1]),
        );
      }
    } catch {
      initialTrack = [];
    }
  }

  const checkpointsWithPhotos = await Promise.all(
    session.checkpoints.map(async (c) => {
      const url = c.photoUrl ? await signedPhotoUrl(c.photoUrl) : null;
      return { ...c, resolvedPhotoUrl: url };
    })
  );

  return (
    <>
      <PageHeader
        eyebrow="Recording"
        title={session.routeName}
        subtitle="Tap Add checkpoint at every house. Everything saves as you go."
        actions={
          <form action={abandonRecordingAction}>
            <input type="hidden" name="sessionId" value={session.id} />
            <button
              type="submit"
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink-dim ring-1 ring-inset ring-line-bright transition-colors hover:bg-bad-dim hover:text-bad"
            >
              Abandon round
            </button>
          </form>
        }
      />

      {/* Narrow column: this screen is used one-handed on a phone. */}
      <div className="mx-auto w-full max-w-xl">
        <RecordingConsole
          sessionId={session.id}
          routeName={session.routeName}
          startedAt={session.startedAt.toISOString()}
          deliveryTypes={deliveryTypes}
          nameOptions={readNameOptions(session.nameOptions)}
          initialTrack={initialTrack}
          checkpoints={checkpointsWithPhotos.map((c) => ({
            id: c.id,
            name: c.name,
            address: c.address,
            latitude: c.latitude,
            longitude: c.longitude,
            deliveryType: c.deliveryType,
            quantity: c.quantity,
            notes: c.notes,
            nextVisitNote: c.nextVisitNote,
            photoUrl: c.resolvedPhotoUrl,
            completedAt: c.completedAt,
            sequence: c.sequence,
          }))}
        />
      </div>
    </>
  );
}
