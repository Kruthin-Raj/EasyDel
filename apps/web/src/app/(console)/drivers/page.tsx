import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { createUserAction, toggleDriverActiveAction } from '@/lib/actions';
import DriverForm from './DriverForm';
import { PageHeader, Card, Table, Td, Badge, EmptyState, Button, Field, when } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DriversPage() {
  await requireUser();

  const drivers = await db.driverProfile.findMany({
    include: {
      user: true,
      assignedRoutes: { select: { id: true, name: true, status: true } },
    },
    orderBy: { user: { firstName: 'asc' } },
  });

  return (
    <>
      <PageHeader
        title="Delivery agents"
        subtitle="Drivers who run daily delivery routes and record proof of delivery."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={`${drivers.length} driver${drivers.length === 1 ? '' : 's'}`}>
            {drivers.length === 0 ? (
              <EmptyState message="No drivers yet." hint="Create one using the form beside this table." />
            ) : (
              <Table head={['Driver', 'Vehicle', 'Assigned routes', 'Status', 'Actions']}>
                {drivers.map((d) => (
                  <tr key={d.id} className="align-top hover:bg-panel-2/60">
                    <Td>
                      <p className="font-medium text-ink">
                        {d.user.firstName} {d.user.lastName}
                      </p>
                      <p className="text-xs text-ink-dim">{d.user.email}</p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        Added {when(d.user.createdAt)}
                      </p>
                    </Td>
                    <Td className="text-ink-dim">{d.vehicleType ?? '—'}</Td>
                    <Td>
                      {d.assignedRoutes.length === 0 ? (
                        <span className="text-ink-dim">None</span>
                      ) : (
                        <ul className="space-y-1">
                          {d.assignedRoutes.map((r) => (
                            <li key={r.id} className="text-ink">
                              {r.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Td>
                    <Td>
                      <Badge>{d.active ? 'ACTIVE' : 'PAUSED'}</Badge>
                    </Td>
                    <Td>
                      <form action={toggleDriverActiveAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <Button variant="secondary" className="px-2 py-1 text-xs">
                          {d.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </form>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <Card title="Add a driver" description="Creates the user and their driver profile.">
          <div className="p-5">
            <DriverForm />
          </div>
        </Card>
      </div>
    </>
  );
}
