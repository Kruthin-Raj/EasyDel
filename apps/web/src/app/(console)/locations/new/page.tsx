import Link from 'next/link';
import { currentUserWith } from '@/lib/permissions';
import Forbidden from '@/components/Forbidden';
import { createLocationAction, createLocationFromLinkAction } from '@/lib/actions';
import ActionForm from '@/components/ActionForm';
import { PageHeader, Card, Field, TextArea, Notice } from '@/components/ui';

export default async function NewLocationPage() {
  const { user, can } = await currentUserWith(['edit_locations']);

  if (!can.edit_locations) {
    return (
      <Forbidden
        title="You can't add permanent locations"
        reason="Creating a permanent delivery location is restricted. Locations you capture while recording a route are saved automatically, so you rarely need this."
        role={user.role}
        hint="An administrator can allow this under Settings → Delivery agent permissions."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Add delivery location"
        subtitle="Creates a reusable delivery point that can be used by any future route."
        actions={
          <Link
            href="/locations"
            className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
          >
            Cancel
          </Link>
        }
      />

      <div className="max-w-2xl space-y-4">
        {/* ---- Quick add from link ---- */}
        <Card title="Quick add from map link">
          <div className="p-5">
            <ActionForm
              action={createLocationFromLinkAction}
              submitLabel="Create from link"
              pendingLabel="Creating…"
            >
              <Field label="Name" name="name" required placeholder="Green Residency" />
              <TextArea
                label="Map link or coordinates"
                name="link"
                rows={2}
                placeholder="https://maps.app.goo.gl/… or 13.6288, 79.4192"
              />
              <Field label="Address" name="address" placeholder="Optional — auto-filled from coords if blank" />

              <label className="flex items-start gap-2.5 rounded-lg bg-surface-2 p-3 ring-1 ring-inset ring-line">
                <input
                  type="checkbox"
                  name="confirmDuplicate"
                  value="yes"
                  className="mt-0.5 check"
                />
                <span className="text-sm text-ink-dim">
                  <span className="font-medium text-ink">Create anyway</span> — tick this only
                  if a duplicate warning appeared and this really is a separate location within 60 m
                  of an existing one.
                </span>
              </label>
            </ActionForm>
          </div>
        </Card>

        {/* ---- Full manual form ---- */}
        <Card title="Manual entry with coordinates">
          <div className="p-5">
            <Notice tone="warning">
              Coordinates must be entered manually for now. Address geocoding is not yet
              implemented, so a location is never created from an unresolved address.
            </Notice>

            <ActionForm
              action={createLocationAction}
              submitLabel="Create location"
              pendingLabel="Creating…"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" name="name" required placeholder="Green Residency" />
                <Field label="Building name" name="buildingName" placeholder="Green Residency" />
              </div>

              <Field label="Address" name="address" required placeholder="12 Tilak Rd, Tirupati" />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Latitude"
                  name="latitude"
                  type="number"
                  step="any"
                  required
                  placeholder="13.6288"
                  hint="Between −90 and 90"
                />
                <Field
                  label="Longitude"
                  name="longitude"
                  type="number"
                  step="any"
                  required
                  placeholder="79.4192"
                  hint="Between −180 and 180"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Floor" name="floor" placeholder="2" />
                <Field label="Unit / apartment" name="unit" placeholder="204" />
              </div>

              <TextArea
                label="Delivery notes"
                name="notes"
                placeholder="Leave newspapers at security desk."
              />
              <TextArea
                label="Entrance instructions"
                name="entranceInstructions"
                rows={2}
                placeholder="Use the side gate; main gate is locked before 07:00."
              />
              <TextArea
                label="Security instructions"
                name="securityInstructions"
                rows={2}
                placeholder="Visitor log required at the desk."
              />

              <label className="flex items-start gap-2.5 rounded-lg bg-surface-2 p-3 ring-1 ring-inset ring-line">
                <input
                  type="checkbox"
                  name="confirmDuplicate"
                  value="yes"
                  className="mt-0.5 check"
                />
                <span className="text-sm text-ink-dim">
                  <span className="font-medium text-ink">Create anyway</span> — tick this only
                  if a duplicate warning appeared and this really is a separate location within 60 m
                  of an existing one.
                </span>
              </label>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
