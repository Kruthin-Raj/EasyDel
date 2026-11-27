import { requireUser } from '@/lib/auth';
import { loadSettings, parseCheckpointTypes, parseGeofenceMetres } from '@/lib/permissions';
import { saveSettingsAction } from '@/lib/actions';
import ActionForm from '@/components/ActionForm';
import { PageHeader, Card, Field, Notice } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  const current = await loadSettings();

  const ownTypes = parseCheckpointTypes(current, user.id);
  const geofence = parseGeofenceMetres(current, user.id);

  return (
    <>
      <PageHeader
        title="Preferences"
        subtitle="Personal settings for recording stops and delivering your routes."
      />

      <div className="max-w-3xl space-y-4">
        <Notice>
          These settings apply only to your account — changing your package types or geofence
          distance never alters anyone else&rsquo;s routes or dropdowns.
        </Notice>

        <Card>
          <div className="p-5">
            <ActionForm action={saveSettingsAction} submitLabel="Save preferences" pendingLabel="Saving…">
              <fieldset className="rounded-lg ring-1 ring-inset ring-line p-4 mb-4">
                <legend className="px-1 text-sm font-semibold text-ink">Package types</legend>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">
                    Your default options when recording a checkpoint
                  </span>
                  <textarea
                    name="checkpoint_type_options"
                    rows={6}
                    defaultValue={ownTypes.join('\n')}
                    className="field resize-y font-mono text-sm"
                  />
                  <span className="mt-1.5 block text-xs text-ink-dim">
                    One per line. These fill the dropdown you pick from at each house &mdash; e.g.
                    &ldquo;Newspaper&rdquo;, &ldquo;Milk&rdquo;, &ldquo;Fruit box&rdquo;. Leave
                    empty to restore the defaults.
                  </span>
                </label>
              </fieldset>

              <fieldset className="rounded-lg ring-1 ring-inset ring-line p-4">
                <legend className="px-1 text-sm font-semibold text-ink">
                  Delivery geofence
                </legend>
                <Field
                  label="Warn if you are further than (metres)"
                  name="delivery_geofence_metres"
                  type="number"
                  required
                  defaultValue={geofence}
                  hint="Between 10 and 5000. You will be asked to confirm before marking a delivery beyond this distance from the stop."
                />
              </fieldset>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
