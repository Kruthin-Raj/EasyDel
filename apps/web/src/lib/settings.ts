/**
 * Default values for admin-configurable settings.
 *
 * Lives outside actions.ts because a `'use server'` module may only export
 * async functions — exporting this object from there breaks the build.
 *
 * Defaults lean permissive: a delivery agent is a trusted employee who needs to
 * build and run their own rounds without waiting on an admin. What stays off is
 * anything that changes the rules for everyone — auto-approving agent routes —
 * and Settings itself remains admin-only.
 *
 * An admin can tighten any of these per deployment; the toggles are read at
 * request time, so a change applies immediately without a redeploy.
 */
export const SETTING_DEFAULTS: Record<string, string> = {
  agents_can_create_routes: 'true',
  agents_can_publish_routes: 'true',
  agents_can_optimize_routes: 'true',
  agents_can_import_excel: 'true',
  agents_can_import_map_links: 'true',
  agents_can_edit_locations: 'true',
  agents_can_request_location_changes: 'true',
  agents_can_create_training_routes: 'true',
  agents_can_share_routes: 'true',
  auto_approve_agent_routes: 'false',
  delivery_geofence_metres: '150',

  /*
   * Newline-separated delivery types offered in the checkpoint form. Kept as
   * editable text so the team can use their own vocabulary without a code
   * change. Empty falls back to DEFAULT_CHECKPOINT_TYPES in permissions.ts.
   */
  checkpoint_type_options: [
    'Large package',
    'Small package',
    'Fruit box',
    'Newspaper',
    'Milk',
    'Food package',
  ].join('\n'),
};
