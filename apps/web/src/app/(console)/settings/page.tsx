import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { can, checkpointTypesKey, parseCheckpointTypes } from '@/lib/permissions';
import Forbidden from '@/components/Forbidden';
import { saveSettingsAction } from '@/lib/actions';
import { SETTING_DEFAULTS } from '@/lib/settings';
import ActionForm from '@/components/ActionForm';
import { PageHeader, Card, Field, Notice } from '@/components/ui';

export const dynamic = 'force-dynamic';

const TOGGLES: { key: string; label: string; description: string }[] = [
  { key: 'agents_can_create_routes', label: 'Agents can create routes', description: 'Allows delivery agents to build their own routes from the mobile app.' },
  { key: 'agents_can_publish_routes', label: 'Agents can publish routes', description: 'When off, agent routes stay as drafts until an admin approves them.' },
  { key: 'agents_can_optimize_routes', label: 'Agents can optimise routes', description: 'Lets agents run the route optimiser themselves.' },
  { key: 'agents_can_import_excel', label: 'Agents can import Excel/CSV', description: 'Allows bulk location import from a spreadsheet on mobile.' },
  { key: 'agents_can_import_map_links', label: 'Agents can import map links', description: 'Allows pasting Google/Apple/Waze links to create stops.' },
  { key: 'agents_can_edit_locations', label: 'Agents can edit permanent locations', description: 'When off, agents may only request changes for admin review.' },
  { key: 'agents_can_request_location_changes', label: 'Agents can request location changes', description: 'Lets agents submit a change request instead of editing directly.' },
  { key: 'agents_can_create_training_routes', label: 'Agents can create training routes', description: 'Allows recording a route by physically driving it.' },
  { key: 'agents_can_share_routes', label: 'Agents can share routes', description: 'Lets agents share a route with another agent, mentor or admin.' },
  { key: 'agents_can_edit_dropdown', label: 'Agents can edit dropdown', description: 'Allows agents to edit the package types dropdown in Settings.' },
  { key: 'auto_approve_agent_routes', label: 'Auto-approve agent routes', description: 'Skips admin review entirely. Leave off for production routes.' },
];

export default async function SettingsPage() {
  const user = await requireUser();

  const isAdmin = user.role === 'ADMIN';
  const canEditDropdown = await can(user, 'edit_dropdown');

  if (!isAdmin && !canEditDropdown) {
    return (
      <Forbidden
        title="Settings are administrator-only"
        reason="These toggles control what every delivery agent is allowed to do, so only administrators can change them."
        role={user.role}
      />
    );
  }

  const rows = await db.setting.findMany();
  const current: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows) current[r.key] = r.value;

  /*
   * The list this user actually edits.
   *
   * An admin maintains the shared team default; an agent maintains their own
   * namespaced list, pre-filled from the shared one so their first save starts
   * from the team's vocabulary rather than an empty box.
   */
  const ownTypes = parseCheckpointTypes(current, isAdmin ? undefined : user.id);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Permissions controlling what delivery agents may do without admin approval."
      />

      <div className="max-w-3xl space-y-4">
        <Notice>
          These values are read by the API and mobile app to gate agent actions. They are stored in
          the database, so they apply immediately without a redeploy.
        </Notice>

        <Card>
          <div className="p-5">
            <ActionForm action={saveSettingsAction} submitLabel="Save settings" pendingLabel="Saving…">
              {isAdmin && (
                <fieldset className="space-y-1 mb-4">
                  <legend className="mb-2 text-sm font-semibold text-ink">
                    Delivery agent permissions
                  </legend>
                  <div className="divide-y divide-line/70 rounded-lg ring-1 ring-inset ring-line">
                    {TOGGLES.map((t) => (
                      <label
                        key={t.key}
                        className="flex cursor-pointer items-start gap-3 p-4 hover:bg-panel-2/60"
                      >
                        <input
                          type="checkbox"
                          name={t.key}
                          defaultChecked={current[t.key] === 'true'}
                          className="check mt-0.5"
                        />
                        <span>
                          <span className="block text-sm font-medium text-ink">{t.label}</span>
                          <span className="block text-sm text-ink-dim">{t.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <fieldset className="rounded-lg ring-1 ring-inset ring-line p-4 mb-4">
                <legend className="px-1 text-sm font-semibold text-ink">Package types</legend>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">
                    {isAdmin
                      ? 'Options offered when recording a checkpoint (team default)'
                      : 'Your own options when recording a checkpoint'}
                  </span>
                  <textarea
                    name="checkpoint_type_options"
                    rows={6}
                    defaultValue={ownTypes.join('\n')}
                    className="field resize-y font-mono text-sm"
                  />
                  <span className="mt-1.5 block text-xs text-ink-dim">
                    One per line. These fill the dropdown you pick from at each house &mdash; use
                    your own vocabulary, e.g. &ldquo;Large package&rdquo;, &ldquo;Small
                    package&rdquo;. Leave empty to restore the defaults.
                    {isAdmin
                      ? ' This is the shared default for every agent who has not set their own.'
                      : ' This list is yours alone — editing it does not change any other agent’s.'}
                  </span>
                </label>
              </fieldset>

              {isAdmin && (
                <fieldset className="rounded-lg ring-1 ring-inset ring-line p-4">
                  <legend className="px-1 text-sm font-semibold text-ink">
                    Delivery geofence
                  </legend>
                  <Field
                    label="Warn if driver is further than (metres)"
                    name="delivery_geofence_metres"
                    type="number"
                    required
                    defaultValue={current.delivery_geofence_metres}
                    hint="Between 10 and 5000. The mobile app warns before accepting a delivery beyond this distance."
                  />
                </fieldset>
              )}
            </ActionForm>
          </div>
        </Card>

        {isAdmin && (
          <Card title="Environment" description="Read-only view of how this instance is configured.">
            <dl className="divide-y divide-line/70">
              {[
                { k: 'Routing provider', v: process.env.ROUTING_PROVIDER ?? 'OSRM (default)' },
                { k: 'OSRM endpoint', v: process.env.OSRM_URL ?? 'not set' },
                { k: 'Geocoding endpoint', v: process.env.GEOCODING_URL ?? 'not set' },
                { k: 'Database', v: process.env.DATABASE_URL ? 'configured' : 'NOT configured' },
                { k: 'Node environment', v: process.env.NODE_ENV ?? 'unknown' },
              ].map((row) => (
                <div key={row.k} className="flex flex-wrap justify-between gap-2 px-5 py-3">
                  <dt className="text-sm font-medium text-ink">{row.k}</dt>
                  <dd className="break-anywhere text-sm text-ink-dim">{row.v}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-dim">
              Secret values are never rendered here — only whether they are set.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
