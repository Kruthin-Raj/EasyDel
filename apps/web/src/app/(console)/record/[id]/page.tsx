import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { loadSettings, parseCheckpointTypes } from '@/lib/permissions';
import { abandonRecordingAction } from '@/lib/recording-actions';
import RecordingConsole from '@/components/RecordingConsole';
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
  const deliveryTypes = parseCheckpointTypes(settings);

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
          checkpoints={session.checkpoints.map((c) => ({
            id: c.id,
            name: c.name,
            address: c.address,
            latitude: c.latitude,
            longitude: c.longitude,
            deliveryType: c.deliveryType,
            quantity: c.quantity,
            notes: c.notes,
            nextVisitNote: c.nextVisitNote,
            photoUrl: c.photoUrl,
            completedAt: c.completedAt,
            sequence: c.sequence,
          }))}
        />
      </div>
    </>
  );
}
