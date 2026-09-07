import { requireUser } from '@/lib/auth';
import { PageHeader, Card, Notice } from '@/components/ui';
import { Smartphone, CircleCheck, CircleDashed } from 'lucide-react';

export const metadata = { title: 'Agent app — EasyDel' };

/**
 * Distribution page for the driver APK.
 *
 * This page previously advertised "v1.0.0 (Production) · 45.2 MB · Updated
 * today" behind a button with no href — none of which was true. No APK has
 * been built yet (there is no eas.json), so it now reports the real state.
 * When Phase 5 of the mobile roadmap lands, replace the checklist below with
 * the signed APK URL, its real size and build date.
 */

const PHASES = [
  { done: false, label: 'Build pipeline (eas.json, APK profile)' },
  { done: false, label: 'Native modules: map, camera, notifications, background GPS' },
  { done: false, label: 'Core delivery screens (13 of 16 remaining)' },
  { done: false, label: 'Offline sync engine' },
  { done: false, label: 'Signed APK published here for download' },
];

const DONE = [
  'Expo app scaffold with tab navigation',
  'WatermelonDB offline schema (locations, routes, stops)',
  'Delivery queue, route map and settings screens',
];

export default async function DownloadAppPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Agent application"
        subtitle="The Android app for delivery agents, distributed directly rather than via the Play Store."
      />

      <Notice tone="warning">
        <strong>No downloadable build exists yet.</strong> The mobile app is still in development,
        so there is deliberately no download button here — an APK link that does nothing is worse
        than none. This page will serve the signed APK once the build pipeline is in place.
      </Notice>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Current status">
          <div className="p-5">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-panel-2">
              <Smartphone className="h-6 w-6 text-ink-dim" aria-hidden />
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="font-medium text-ink">Build available</dt>
                <dd className="text-ink-dim">No</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-medium text-ink">Screens implemented</dt>
                <dd className="tabular-nums text-ink-dim">3 of 16</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-medium text-ink">Distribution</dt>
                <dd className="text-ink-dim">Direct APK (planned)</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-medium text-ink">Minimum Android</dt>
                <dd className="text-ink-dim">To be confirmed</dd>
              </div>
            </dl>

            <h3 className="mt-5 text-sm font-semibold text-ink">Already working</h3>
            <ul className="mt-2 space-y-1.5">
              {DONE.map((d) => (
                <li key={d} className="flex items-start gap-2 text-sm text-ink-dim">
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title="Remaining before release" description="In dependency order.">
          <ol className="divide-y divide-line/70">
            {PHASES.map((p, i) => (
              <li key={p.label} className="flex items-start gap-3 px-5 py-3">
                <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-ink">
                    Phase {i + 1}
                  </p>
                  <p className="text-sm text-ink-dim">{p.label}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-dim">
            Full breakdown and estimates are in the repository README under “Mobile roadmap”.
          </p>
        </Card>
      </div>

      <Card title="How direct distribution will work" description="For reference once a build exists.">
        <ol className="list-decimal space-y-2 px-5 py-5 pl-10 text-sm text-ink-dim">
          <li>
            CI runs <code className="font-mono">eas build -p android --profile preview</code>, which
            produces an installable APK rather than the Play-Store AAB.
          </li>
          <li>The APK is uploaded to a private Supabase Storage bucket.</li>
          <li>
            This page requests a short-lived signed URL, so the binary is never publicly listable.
          </li>
          <li>
            Drivers open the link on their phone, allow “Install from unknown sources”, and install.
          </li>
          <li>
            The version, size and build date shown here come from the API — never hardcoded.
          </li>
        </ol>
      </Card>
    </>
  );
}
