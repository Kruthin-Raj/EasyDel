/**
 * Reason and category vocabularies for the delivery run.
 *
 * Lives outside run-actions.ts because a `'use server'` module may only export
 * async functions — exporting these arrays from there breaks the build with
 * "A 'use server' file can only export async functions, found object".
 *
 * These are fixed rather than admin-configurable on purpose: they are reported
 * on and counted, so a stable vocabulary keeps history comparable over time.
 * The free-text note beside each captures anything they don't cover.
 */

export const SKIP_REASONS = [
  'Subscription cancelled',
  'Customer unavailable',
  'Building inaccessible',
  'Wrong address',
  'Safety issue',
  'Already delivered',
  'Other',
];

export const ISSUE_CATEGORIES = [
  'Wrong location',
  'Building inaccessible',
  'Customer complaint',
  'Damaged goods',
  'Vehicle problem',
  'Safety concern',
  'Other',
];
