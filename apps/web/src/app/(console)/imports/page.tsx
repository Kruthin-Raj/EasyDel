import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { locationWhere } from '@/lib/scope';
import Importer from '@/components/Importer';
import { PageHeader, Card, Notice } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ImportsPage() {
  const user = await requireUser();

  // Passed to the client so duplicate detection can run during preview,
  // before anything is written. Scoped strictly to this user's locations.
  const existing = await db.deliveryLocation.findMany({
    where: { ...locationWhere(user), status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { name: true, latitude: true, longitude: true },
  });

  return (
    <>
      <PageHeader
        title="Import locations"
        subtitle="Bulk-create delivery locations from a CSV file, with column mapping and a preview."
      />

      <Notice tone="warning">
        Rows without coordinates cannot be imported yet — address geocoding is not implemented, and
        a location is never created at a guessed position. Include latitude and longitude columns,
        or add those rows manually.
      </Notice>

      <Importer existing={existing} />

      <Card title="Expected format" description="A header row plus one row per delivery location.">
        <div className="overflow-x-auto p-5">
          <pre className="min-w-max rounded-lg bg-surface p-4 text-xs leading-relaxed text-ink ring-1 ring-inset ring-line">
{`name,address,latitude,longitude,quantity,type,notes
Green Residency,12 Tilak Rd Tirupati,13.6288,79.4192,12,Newspaper,Leave at security desk
Sai Towers,45 Bhavani Nagar Tirupati,13.6335,79.4241,1,Newspaper,Ring bell twice
Royal Apartments,8 Korlagunta Tirupati,13.6412,79.4103,2,Milk,Dog on premises`}
          </pre>
          <p className="mt-3 text-sm text-ink-dim">
            Header names are matched case-insensitively against common aliases — <code className="font-mono">qty</code>{' '}
            works for quantity, <code className="font-mono">lat</code>/<code className="font-mono">lng</code> for
            coordinates, <code className="font-mono">customer</code>/<code className="font-mono">building</code> for
            name. Anything unmatched can be mapped by hand.
          </p>
        </div>
      </Card>
    </>
  );
}
