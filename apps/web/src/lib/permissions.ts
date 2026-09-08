import { db } from './db';
import { SETTING_DEFAULTS } from './settings';
import { requireUser, type SessionUser } from './auth';

/**
 * Capability checks.
 *
 * Roles alone are too blunt: the spec requires an admin to be able to decide
 * what delivery agents may do (create routes, import files, edit locations…),
 * so those decisions live in the `Setting` table and are read here.
 *
 * ADMIN always passes. Everyone else passes only if the relevant toggle is on.
 */

export type Capability =
  | 'create_routes'
  | 'publish_routes'
  | 'optimize_routes'
  | 'import_excel'
  | 'import_map_links'
  | 'edit_locations'
  | 'request_location_changes'
  | 'create_training_routes'
  | 'share_routes'
  | 'edit_dropdown';

/** Capability -> the Setting key that governs it for non-admins. */
const SETTING_FOR: Record<Capability, string> = {
  create_routes: 'agents_can_create_routes',
  publish_routes: 'agents_can_publish_routes',
  optimize_routes: 'agents_can_optimize_routes',
  import_excel: 'agents_can_import_excel',
  import_map_links: 'agents_can_import_map_links',
  edit_locations: 'agents_can_edit_locations',
  request_location_changes: 'agents_can_request_location_changes',
  create_training_routes: 'agents_can_create_training_routes',
  share_routes: 'agents_can_share_routes',
  edit_dropdown: 'agents_can_edit_dropdown',
};

/** Reads all settings once, falling back to the documented defaults. */
export async function loadSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany();
  const merged: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of rows) merged[row.key] = row.value;
  return merged;
}

export async function can(user: SessionUser, capability: Capability): Promise<boolean> {
  if (user.role === 'ADMIN') return true;

  const settings = await loadSettings();
  const key = SETTING_FOR[capability];
  return settings[key] === 'true';
}

/** Convenience for pages: the user plus the capabilities they hold. */
export async function currentUserWith(capabilities: Capability[]) {
  const user = await requireUser();
  const settings = await loadSettings();

  const granted = {} as Record<Capability, boolean>;
  for (const capability of capabilities) {
    granted[capability] =
      user.role === 'ADMIN' || settings[SETTING_FOR[capability]] === 'true';
  }
  return { user, can: granted, settings };
}

/**
 * Guard for Server Actions. Throws with a message naming the capability, which
 * is more useful than a bare "Forbidden" when it shows up in a log.
 */
export async function requireCapability(capability: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (await can(user, capability)) return user;
  throw new Error(
    `Forbidden — your role (${user.role}) is not permitted to ${capability.replace(/_/g, ' ')}.`,
  );
}

/**
 * Delivery-type options offered in the checkpoint form.
 *
 * Stored as a newline-separated list in Settings so the team can maintain their
 * own vocabulary ("Large package", "Small package", "Fruit box") without a code
 * change or a migration.
 */
export const DEFAULT_CHECKPOINT_TYPES = [
  'Large package',
  'Small package',
  'Fruit box',
  'Newspaper',
  'Milk',
  'Food package',
];

/**
 * Settings key holding one agent's own package-type list.
 *
 * `Setting.key` is the primary key, so `checkpoint_type_options` is a single
 * global row. An agent granted `edit_dropdown` was therefore overwriting the
 * list for every other agent — one agent's dropdown showed up in everyone
 * else's. Namespacing by user id keeps each agent's edits their own while
 * `Setting` stays a plain key/value table.
 */
export function checkpointTypesKey(userId: string) {
  return `checkpoint_type_options:${userId}`;
}

/**
 * The package-type options to offer this user.
 *
 * Resolution order:
 *   1. the user's own list, if they have customised it
 *   2. the shared list an admin set for the team
 *   3. the built-in defaults
 *
 * Passing no `userId` yields the shared list, which is what the admin-facing
 * Settings page should show.
 */
export function parseCheckpointTypes(
  settings: Record<string, string>,
  userId?: string,
): string[] {
  const own = userId ? split(settings[checkpointTypesKey(userId)]) : [];
  if (own.length > 0) return own;

  const shared = split(settings.checkpoint_type_options);
  return shared.length > 0 ? shared : DEFAULT_CHECKPOINT_TYPES;
}

/** Newline-separated list -> trimmed, non-empty entries. */
function split(raw: string | undefined): string[] {
  return (raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
