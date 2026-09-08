import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { trainingWhere } from '@/lib/scope';
import { PageHeader, Card, Table, Td, EmptyState, Notice, when, duration, metres } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function TrainingRoutesPage() {
  const user = await requireUser();

  // An agent sees the rounds they recorded, were trained on, or mentored —
  // not every recording anyone has ever made.
  const sessions = await db.trainingSession.findMany({
    where: trainingWhere(user),
    include: {
      mentor: true,
      trainee: true,
      checkpoints: { orderBy: { timestamp: 'asc' } },
    },
    orderBy: { startedAt: 'desc' },
  });

  return (
    <>
      <PageHeader
        title="Training routes"
        subtitle="Recorded mentor-and-trainee sessions, with the checkpoints captured in the field."
      />

      {sessions.length === 0 ? (
        <Card>
          <EmptyState
            message="No training sessions recorded."
            hint="Sessions are created from the mobile app in training mode."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {sessions.map((s) => (
            <Card
              key={s.id}
              title={s.routeName}
              aside={
                <Link
                  href={`/training-routes/${s.id}`}
                  className="shrink-0 rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
                >
                  Open
                </Link>
              }
              description={`${s.mentor.firstName} ${s.mentor.lastName} training ${s.trainee.firstName} ${s.trainee.lastName}`}
            >
              <div className="grid grid-cols-2 gap-px border-b border-line bg-line lg:grid-cols-4">
                {[
                  { label: 'Distance', value: metres(s.distance) },
                  { label: 'Duration', value: duration(s.duration) },
                  { label: 'Checkpoints', value: String(s.checkpoints.length) },
                  { label: 'Recorded', value: when(s.startedAt) },
                ].map((m) => (
                  <div key={m.label} className="bg-panel px-5 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-dim">
                      {m.label}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-ink">{m.value}</p>
                  </div>
                ))}
              </div>

              {s.checkpoints.length === 0 ? (
                <EmptyState message="No checkpoints in this session." />
              ) : (
                <Table head={['#', 'Building', 'Address', 'Delivery', 'Notes', 'Recorded']}>
                  {s.checkpoints.map((c, i) => (
                    <tr key={c.id} className="align-top hover:bg-panel-2/60">
                      <Td className="tabular-nums text-ink-dim">{i + 1}</Td>
                      <Td>
                        <p className="font-medium text-ink">{c.name}</p>
                        <p className="text-xs text-ink-dim">
                          {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
                        </p>
                        {c.floor || c.unit ? (
                          <p className="text-xs text-ink-dim">
                            {[c.floor && `Floor ${c.floor}`, c.unit].filter(Boolean).join(' · ')}
                          </p>
                        ) : null}
                      </Td>
                      <Td className="max-w-56 text-ink-dim">
                        <span className="break-anywhere">{c.address}</span>
                      </Td>
                      <Td className="text-ink">
                        {c.quantity != null ? `${c.quantity} × ` : ''}
                        {c.deliveryType ?? '—'}
                      </Td>
                      <Td className="max-w-64 text-ink-dim">
                        {c.notes ?? <span className="text-ink-faint">—</span>}
                        {c.entranceInstructions && (
                          <p className="mt-1 text-xs text-ink-dim">
                            Entrance: {c.entranceInstructions}
                          </p>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-ink-dim">{when(c.timestamp)}</Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          ))}
        </div>
      )}

      <Notice tone="warning">
        Checkpoint photos and the recorded GPS track are not shown yet — photo upload to Supabase
        Storage and track replay are still to be built. See the README TODO.
      </Notice>
    </>
  );
}
