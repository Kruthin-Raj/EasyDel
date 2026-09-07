import Link from 'next/link';
import { db } from '@/lib/db';
import { currentUserWith } from '@/lib/permissions';
import { startRecordingAction } from '@/lib/recording-actions';
import StartRecordingForm from '@/components/StartRecordingForm';
import Forbidden from '@/components/Forbidden';
import { PageHeader, Card, Table, Td, Badge, EmptyState, Notice, when, metres, duration } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Record a route — EasyDel' };

export default async function RecordPage() {
  const { user, can } = await currentUserWith(['create_training_routes']);

  if (!can.create_training_routes) {
    return (
      <Forbidden
        title="Recording routes is turned off for your role"
        reason="An administrator has disabled route recording for delivery agents."
        role={user.role}
        hint="They can re-enable it under Settings → Delivery agent permissions."
      />
    );
  }

  const [active, mentors, past] = await Promise.all([
    db.trainingSession.findFirst({
      where: { recordedById: user.id, status: 'RECORDING' },
      include: { _count: { select: { checkpoints: true } } },
    }),
    db.user.findMany({
      where: { role: { in: ['MENTOR', 'ADMIN'] } },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: { firstName: 'asc' },
    }),
    db.trainingSession.findMany({
      where: {
        status: { in: ['COMPLETED', 'ABANDONED'] },
        OR: [{ recordedById: user.id }, { traineeId: user.id }],
      },
      include: { _count: { select: { checkpoints: true } } },
      orderBy: { startedAt: 'desc' },
      take: 10,
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="First day"
        title="Record a route"
        subtitle="Drive the round once, logging each house as you reach it. From tomorrow the app gives you the route back."
      />

      {active ? (
        // A round already in progress takes over the page — resuming it is the
        // only sensible action, and starting a second would split the round.
        <Card>
          <div className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="live-dot h-2 w-2 rounded-full bg-ok" aria-hidden />
              <p className="eyebrow text-ok">Recording in progress</p>
            </div>
            <h2 className="text-lg font-semibold text-ink">{active.routeName}</h2>
            <p className="mt-1 text-sm text-ink-dim">
              Started {when(active.startedAt)} · {active._count.checkpoints} house
              {active._count.checkpoints === 1 ? '' : 's'} logged
            </p>
            <Link
              href={`/record/${active.id}`}
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-3 text-base font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
            >
              Resume recording
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
          <Card title="Start a new round">
            <div className="p-5">
              <StartRecordingForm action={startRecordingAction} mentors={mentors} />
            </div>
          </Card>

          <div className="space-y-4">
            <Notice>
              <strong className="font-semibold">How this works.</strong> Tap start before you set
              off. At every house, tap <em>Add checkpoint</em> — the app takes your GPS position
              automatically. Add a photo and notes if it helps, then mark it delivered. When you
              finish, turn the recording into a delivery route and follow it tomorrow.
            </Notice>

            <Card title="Your past rounds">
              {past.length === 0 ? (
                <EmptyState message="You haven’t recorded a round yet." />
              ) : (
                <Table head={['Route', 'Houses', 'Distance', 'Time', 'Status']}>
                  {past.map((session) => (
                    <tr key={session.id} className="align-top hover:bg-panel-2/60">
                      <Td>
                        <Link
                          href={`/training-routes/${session.id}`}
                          className="font-medium text-accent hover:underline"
                        >
                          {session.routeName}
                        </Link>
                        <p className="text-xs text-ink-dim">{when(session.startedAt)}</p>
                      </Td>
                      <Td className="numeric text-ink">{session._count.checkpoints}</Td>
                      <Td className="numeric text-ink">{metres(session.distance)}</Td>
                      <Td className="numeric text-ink">{duration(session.duration)}</Td>
                      <Td>
                        <Badge>{session.status === 'COMPLETED' ? 'APPROVED' : 'ARCHIVED'}</Badge>
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
