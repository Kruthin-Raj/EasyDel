import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { updateLocationAction } from '@/lib/actions';
import ActionForm from '@/components/ActionForm';
import Forbidden from '@/components/Forbidden';
import { PageHeader, Card, Field, TextArea } from '@/components/ui';

export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const location = await db.deliveryLocation.findUnique({
    where: { id },
    include: { subscriptions: { where: { status: 'ACTIVE' } } },
  });
  if (!location) notFound();

  const activeSub = location.subscriptions[0] ?? null;

  if (location.createdById !== user.id) {
    return (
      <Forbidden
        title="You can only edit your own locations"
        reason="Delivery locations belong strictly to the user who created them."
        hint="Create or manage your own locations from Locations."
      />
    );
  }

  return (
    <>
      <PageHeader
        title={`Edit ${location.name}`}
        subtitle="Update details for this delivery point."
      />

      <div className="max-w-2xl space-y-4">
        <Card>
          <div className="p-5">
            <ActionForm
              action={updateLocationAction}
              submitLabel="Save changes"
              pendingLabel="Saving…"
            >
              <input type="hidden" name="id" value={location.id} />
              
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" name="name" required defaultValue={location.name} />
                <Field label="Building name" name="buildingName" defaultValue={location.buildingName ?? ''} />
              </div>

              <Field label="Address" name="address" required defaultValue={location.address} />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Latitude"
                  name="latitude"
                  type="number"
                  step="any"
                  required
                  defaultValue={location.latitude}
                  hint="Between −90 and 90"
                />
                <Field
                  label="Longitude"
                  name="longitude"
                  type="number"
                  step="any"
                  required
                  defaultValue={location.longitude}
                  hint="Between −180 and 180"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Floor" name="floor" defaultValue={location.floor ?? ''} />
                <Field label="Unit / apartment" name="unit" defaultValue={location.unit ?? ''} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Delivery item"
                  name="productType"
                  defaultValue={activeSub?.productType ?? 'Package'}
                  placeholder="Package, Newspaper, Milk"
                />
                <Field
                  label="Quantity"
                  name="quantity"
                  type="number"
                  min={1}
                  defaultValue={activeSub?.quantity ?? 1}
                />
              </div>

              <TextArea
                label="Delivery notes"
                name="notes"
                defaultValue={location.notes ?? ''}
              />
              <TextArea
                label="Entrance instructions"
                name="entranceInstructions"
                rows={2}
                defaultValue={location.entranceInstructions ?? ''}
              />
              <TextArea
                label="Security instructions"
                name="securityInstructions"
                rows={2}
                defaultValue={location.securityInstructions ?? ''}
              />
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
