import type { SessionUser } from './auth';
import { loadSettings } from './permissions';
import { seesAllData } from './scope';

/*
 * Which navigation destinations a given user may actually open.
 *
 * Previously the sidebar listed all fourteen pages to everyone, so an agent
 * tapping "Drivers" reached a page that then refused them — the crash this
 * closes. A link to somewhere you cannot go is not information, it is a dead
 * end, so the entries are filtered instead of the destination apologising.
 *
 * This is presentation only. Hiding a link is not a security boundary: each
 * page still checks for itself, and each Server Action still calls
 * requireAdmin/requireCapability. A hand-typed URL or a direct POST hits the
 * real check, which is where authorisation belongs.
 */

/** Pages that manage people. Kept ADMIN-only. */
const USER_MANAGEMENT = ['/drivers', '/mentors'];

export async function allowedNavHrefs(user: SessionUser): Promise<string[]> {
  const settings = await loadSettings();
  const isAdmin = user.role === 'ADMIN';

  /*
   * Routes and checkpoints are open to agents by design — the operator asked
   * for agents to have close-to-admin reach over the work itself, just not
   * over accounts. So the default is "visible" and only the exceptions below
   * are filtered out.
   */
  const hidden = new Set<string>();

  if (!isAdmin) {
    for (const href of USER_MANAGEMENT) hidden.add(href);

    // Settings holds the toggles that govern every agent. An agent only needs
    // it when they have been granted the package-types dropdown.
    if (settings.agents_can_edit_dropdown !== 'true') hidden.add('/settings');

    // Bulk import is capability-gated; the page itself already enforces this.
    if (settings.agents_can_import_excel !== 'true') hidden.add('/imports');

    // Reports and live tracking aggregate across the whole operation. Scoped
    // to one agent they show only that agent, which is not a report.
    if (!seesAllData(user)) {
      hidden.add('/reports');
      hidden.add('/live');
    }
  }

  return [...ALL_NAV_HREFS].filter((href) => !hidden.has(href));
}

/**
 * Every destination the sidebar can show.
 *
 * Kept here rather than inferred from the sidebar so the filter above is
 * total: a new page must be listed to appear, and forgetting to classify one
 * hides it rather than exposing it.
 */
export const ALL_NAV_HREFS = [
  '/',
  '/record',
  '/live',
  '/locations',
  '/routes',
  '/routes/from-links',
  '/imports',
  '/drivers',
  '/mentors',
  '/training-routes',
  '/delivery-history',
  '/reports',
  '/settings',
] as const;
