import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { loadSettings, parseUserPreferences } from '@/lib/permissions';
import {
  saveSettingsAction,
  updateProfileAction,
  changePasswordAction,
} from '@/lib/actions';
import ActionForm from '@/components/ActionForm';
import { PageHeader, Card, Field, Select, Notice, Badge, when } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  const [current, account] = await Promise.all([
    loadSettings(),
    db.user.findUnique({
      where: { id: user.id },
      select: { emailVerified: true, createdAt: true, passwordHash: true },
    }),
  ]);

  const prefs = parseUserPreferences(current, user.id);

  return (
    <>
      <PageHeader
        eyebrow="Account & App"
        title="Settings & preferences"
        subtitle="Manage your profile, route defaults, memorization mode behavior, delivery geofence, and password."
        actions={
          <Link
            href="/contact"
            className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
          >
            Need help? Contact us
          </Link>
        }
      />

      <Notice>
        All route and delivery settings here belong strictly to your account — changing your depot
        coordinates, package types, or geofence never alters anyone else&rsquo;s routes.
      </Notice>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---- Left column: Preferences ---- */}
        <div className="lg:col-span-2">
          <Card
            title="Route, Memorize & Delivery preferences"
            description="Customise recording pick-lists, default start point, and delivery prompts."
          >
            <div className="p-5">
              <ActionForm
                action={saveSettingsAction}
                submitLabel="Save preferences"
                pendingLabel="Saving…"
              >
                <fieldset className="mb-4 rounded-lg p-4 ring-1 ring-inset ring-line">
                  <legend className="px-1 text-sm font-semibold text-ink">Package types</legend>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">
                      Your default options when recording a checkpoint
                    </span>
                    <textarea
                      name="checkpoint_type_options"
                      rows={5}
                      defaultValue={prefs.checkpointTypes.join('\n')}
                      className="field resize-y font-mono text-sm"
                    />
                    <span className="mt-1.5 block text-xs text-ink-dim">
                      One per line (e.g. Newspaper, Milk, Fruit box). Leave empty to restore the
                      built-in defaults.
                    </span>
                  </label>
                </fieldset>

                <fieldset className="mb-4 rounded-lg p-4 ring-1 ring-inset ring-line">
                  <legend className="px-1 text-sm font-semibold text-ink">
                    Default start / depot location
                  </legend>
                  <p className="mb-3 text-xs text-ink-dim">
                    Pre-fills Start &amp; End coordinates whenever you build a route from saved locations.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field
                      label="Start name"
                      name="default_start_name"
                      defaultValue={prefs.defaultStartName}
                      placeholder="Depot"
                    />
                    <Field
                      label="Latitude"
                      name="default_start_latitude"
                      type="number"
                      step="any"
                      defaultValue={prefs.defaultStartLat}
                    />
                    <Field
                      label="Longitude"
                      name="default_start_longitude"
                      type="number"
                      step="any"
                      defaultValue={prefs.defaultStartLng}
                    />
                  </div>
                </fieldset>

                <fieldset className="mb-4 rounded-lg p-4 ring-1 ring-inset ring-line">
                  <legend className="px-1 text-sm font-semibold text-ink">
                    Delivery geofence &amp; units
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Warn if you are further than (metres)"
                      name="delivery_geofence_metres"
                      type="number"
                      required
                      defaultValue={prefs.geofenceMetres}
                      hint="Between 10 and 5000 m. Prompts confirmation outside this distance."
                    />
                    <Select
                      label="Preferred distance units"
                      name="distance_unit"
                      defaultValue={prefs.distanceUnit}
                      options={[
                        { value: 'metric', label: 'Metric (metres / km)' },
                        { value: 'imperial', label: 'Imperial (feet / miles)' },
                      ]}
                    />
                  </div>
                </fieldset>

                <fieldset className="rounded-lg p-4 ring-1 ring-inset ring-line">
                  <legend className="px-1 text-sm font-semibold text-ink">
                    Memorize &amp; Delivery Console behavior
                  </legend>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="memorize_quiz_default"
                        defaultChecked={prefs.memorizeQuizDefault}
                        className="check mt-0.5"
                      />
                      <span className="text-sm">
                        <span className="block font-medium text-ink">
                          Start Memorize mode in Quiz mode
                        </span>
                        <span className="text-xs text-ink-dim">
                          Hides house names &amp; delivery items until you tap Reveal so you can
                          test your memory first.
                        </span>
                      </span>
                    </label>

                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="memorize_auto_advance"
                        defaultChecked={prefs.memorizeAutoAdvance}
                        className="check mt-0.5"
                      />
                      <span className="text-sm">
                        <span className="block font-medium text-ink">
                          Auto-advance to next stop during practice
                        </span>
                        <span className="text-xs text-ink-dim">
                          Moves directly to the next unmastered stop after you tap Got it or Review.
                        </span>
                      </span>
                    </label>

                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="show_bag_reminder"
                        defaultChecked={prefs.showBagReminder}
                        className="check mt-0.5"
                      />
                      <span className="text-sm">
                        <span className="block font-medium text-ink">
                          Show “Still in your bag” reminder after each delivery
                        </span>
                        <span className="text-xs text-ink-dim">
                          Displays a brief summary of remaining packages after marking a stop delivered.
                        </span>
                      </span>
                    </label>
                  </div>
                </fieldset>
              </ActionForm>
            </div>
          </Card>
        </div>

        {/* ---- Right column: Profile & Password ---- */}
        <div className="space-y-6">
          <Card title="Profile" description="How your name appears on shared routes.">
            <div className="p-5">
              <div className="mb-4 rounded-lg bg-surface-2 px-3.5 py-3 ring-1 ring-inset ring-line">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink">{user.email}</p>
                  <Badge>{account?.emailVerified ? 'ACTIVE' : 'PENDING'}</Badge>
                </div>
                {account?.createdAt && (
                  <p className="mt-1 text-xs text-ink-dim">
                    Member since {when(account.createdAt)}
                  </p>
                )}
              </div>

              <ActionForm
                action={updateProfileAction}
                submitLabel="Update profile"
                pendingLabel="Updating…"
              >
                <Field
                  label="First name"
                  name="firstName"
                  required
                  defaultValue={user.firstName}
                />
                <Field
                  label="Last name"
                  name="lastName"
                  defaultValue={user.lastName}
                />
              </ActionForm>
            </div>
          </Card>

          <Card
            title="Account security"
            description={
              account?.passwordHash
                ? 'Update your password at any time.'
                : 'You signed in with Google — optionally set a password for email sign-in too.'
            }
          >
            <div className="p-5">
              <ActionForm
                action={changePasswordAction}
                submitLabel={account?.passwordHash ? 'Change password' : 'Set password'}
                pendingLabel="Saving…"
              >
                {account?.passwordHash && (
                  <Field
                    label="Current password"
                    name="currentPassword"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                )}
                <Field
                  label="New password"
                  name="newPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  hint="At least 8 characters."
                />
                <Field
                  label="Confirm new password"
                  name="confirmPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                />
              </ActionForm>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
