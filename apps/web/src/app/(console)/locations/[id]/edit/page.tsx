import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { currentUserWith } from '@/lib/permissions';
import Forbidden from '@/components/Forbidden';
import { updateLocationAction } from '@/lib/actions';
import ActionForm from '@/components/ActionForm';
import { PageHeader, Card, Field, TextArea } from '@/components/ui';

export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, can } = await currentUserWith(['edit_locations']);
  const { id } = await params;

  if (!can.edit_locations) {
    return (
      <Forbidden
        title="You can’t edit permanent locations"
        reason="Editing a permanent delivery location is restricted."
        role={user.role}
        hint="An administrator can allow this under Settings → Delivery agent permissions."
      />
    );
  }

  const location = await db.deliveryLocation.findUnique({ where: { id } });
  if (!location) notFound();

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
