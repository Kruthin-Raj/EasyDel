import { db } from './db';
import { SETTING_DEFAULTS } from './settings';
import { requireUser, type SessionUser } from './auth';

/**
 * Capabilities and per-user preferences.
 *
 * There is no admin hierarchy — every signed-in person can create routes in
 * any way, manage locations, share routes by code/link, memorize shared
 * routes, and deliver based on them.
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

/** Reads all settings once, falling back to the documented defaults. */
export async function loadSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany();
  const merged: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of rows) merged[row.key] = row.value;
  return merged;
}

export async function can(): Promise<boolean> {
  return true;
}

/** Convenience for pages: the user plus their capabilities and settings. */
export async function currentUserWith(capabilities: Capability[]) {
  const user = await requireUser();
  const settings = await loadSettings();

  const granted = {} as Record<Capability, boolean>;
  for (const capability of capabilities) {
    granted[capability] = true;
  }
  return { user, can: granted, settings };
}

/** Guard for Server Actions — verifies the user is signed in. */
export async function requireCapability(capability: Capability): Promise<SessionUser> {
  void capability;
  return requireUser();
}

/**
 * Delivery-type options offered in the checkpoint form.
 */
export const DEFAULT_CHECKPOINT_TYPES = [
  'Large package',
  'Small package',
  'Fruit box',
  'Newspaper',
  'Milk',
  'Food package',
];

/** Settings key holding one user's own package-type list. */
export function checkpointTypesKey(userId: string) {
  return `checkpoint_type_options:${userId}`;
}

/** Settings key holding one user's own delivery geofence distance in metres. */
export function geofenceKey(userId: string) {
  return `delivery_geofence_metres:${userId}`;
}

/**
 * The package-type options to offer this user.
 *
 * Resolution order:
 *   1. the user's own list, if they have customised it
 *   2. the shared default list
 *   3. the built-in defaults
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

/** Delivery geofence in metres (10..5000), preferring the user's own setting. */
export function parseGeofenceMetres(
  settings: Record<string, string>,
  userId?: string,
): number {
  const own = userId ? Number(settings[geofenceKey(userId)]) : NaN;
  if (Number.isFinite(own) && own >= 10 && own <= 5000) return own;

  const fallback = Number(settings.delivery_geofence_metres);
  if (Number.isFinite(fallback) && fallback >= 10 && fallback <= 5000) return fallback;

  return 150;
}

/** Newline-separated list -> trimmed, non-empty entries. */
function split(raw: string | undefined): string[] {
  return (raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
