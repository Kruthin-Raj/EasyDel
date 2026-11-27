/**
 * Navigation destinations open to every signed-in user.
 *
 * There is no admin hierarchy — everyone can create routes in every way, join
 * shared routes by code or link, memorize routes, and deliver based on them.
 */
export async function allowedNavHrefs(): Promise<string[]> {
  return [...ALL_NAV_HREFS];
}

/**
 * Every destination the sidebar shows.
 */
export const ALL_NAV_HREFS = [
  '/',
  '/routes',
  '/share',
  '/record',
  '/routes/from-links',
  '/training-routes',
  '/locations',
  '/imports',
  '/delivery-history',
  '/live',
  '/reports',
  '/settings',
] as const;
