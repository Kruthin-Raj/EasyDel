import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { createUserAction } from '@/lib/actions';
import ActionForm from '@/components/ActionForm';
import { PageHeader, Card, Table, Td, Badge, EmptyState, Field, when, duration, metres } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function MentorsPage() {
  await requireUser();

  const mentors = await db.mentorProfile.findMany({
    include: { user: { include: { trainingSessions: true } } },
    orderBy: { user: { firstName: 'asc' } },
  });

  return (
    <>
      <PageHeader
        title="Mentors"
        subtitle="Mentors run training sessions with trainees and record checkpoints in the field."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={`${mentors.length} mentor${mentors.length === 1 ? '' : 's'}`}>
            {mentors.length === 0 ? (
              <EmptyState message="No mentors yet." hint="Create one using the form beside this table." />
            ) : (
              <Table head={['Mentor', 'Sessions led', 'Distance trained', 'Status']}>
                {mentors.map((m) => {
                  const sessions = m.user.trainingSessions;
                  const totalDistance = sessions.reduce((sum, s) => sum + (s.distance ?? 0), 0);
                  const totalDuration = sessions.reduce((sum, s) => sum + (s.duration ?? 0), 0);
                  return (
                    <tr key={m.id} className="align-top hover:bg-panel-2/60">
                      <Td>
                        <p className="font-medium text-ink">
                          {m.user.firstName} {m.user.lastName}
                        </p>
                        <p className="text-xs text-ink-dim">{m.user.email}</p>
                        <p className="mt-0.5 text-xs text-ink-faint">
                          Added {when(m.user.createdAt)}
                        </p>
                      </Td>
                      <Td className="tabular-nums text-ink">
                        {sessions.length}
                        {sessions.length > 0 && (
                          <p className="text-xs text-ink-dim">{duration(totalDuration)} total</p>
                        )}
                      </Td>
                      <Td className="tabular-nums text-ink">{metres(totalDistance)}</Td>
                      <Td>
                        <Badge>{m.active ? 'ACTIVE' : 'PAUSED'}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </div>

        <Card title="Add a mentor" description="Creates the user and their mentor profile.">
          <div className="p-5">
            <ActionForm action={createUserAction} submitLabel="Create mentor" pendingLabel="Creating…">
              <input type="hidden" name="role" value="MENTOR" />
              <Field label="First name" name="firstName" required />
              <Field label="Last name" name="lastName" required />
              <Field label="Email" name="email" type="email" required />
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
