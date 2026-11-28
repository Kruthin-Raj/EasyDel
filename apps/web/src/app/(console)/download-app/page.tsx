import { requireUser } from '@/lib/auth';
import { resolveApkRelease } from '@/lib/app-release';
import { PageHeader, Card, Notice } from '@/components/ui';
import { Smartphone, CircleCheck, CircleDashed, Download } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Agent app — EasyDel' };

const PHASES = [
  { done: true, label: 'Splash animation, Guest mode (Continue without login) & auth gate on save' },
  { done: true, label: 'Build profile (eas.json Android APK profile + app.json Android package)' },
  { done: true, label: 'Code sharing, Memorize flashcards/quiz & Offline SQLite delivery queue' },
  { done: true, label: 'Mobile sync API routes (/api/mobile/auth, /share/[code], /routes/save, /runs/sync)' },
  { done: false, label: 'Built & uploaded signed APK binary ready on this page' },
];

const DONE = [
  'Animated brand splash + Guest preview + Login modal on Save',
  'Route & location loading via 8-character code',
  'Offline WatermelonDB SQLite cache + Memorize quiz mode + Sync queue',
  'EAS preview APK profile configured for direct sideloading (no Play Store)',
];

function formatBytes(bytes: number | null) {
  if (!bytes || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default async function DownloadAppPage() {
  await requireUser();
  const release = await resolveApkRelease();

  return (
    <>
      <PageHeader
        title="Agent Android app"
        subtitle="Fast, offline-ready Android app downloaded directly from this website (no Play Store)."
      />

      {release.available && release.downloadUrl ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ok/40 bg-ok-dim/30 p-5">
          <div>
            <p className="eyebrow text-ok">Ready for Android</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">
              EasyDel Mobile v{release.version}
            </h2>
            <p className="mt-0.5 text-xs text-ink-dim">
              Direct APK install · Size: {formatBytes(release.sizeBytes)}
              {release.updatedAt ? ` · Updated ${release.updatedAt.slice(0, 10)}` : ''}
            </p>
          </div>
          <a
            href={release.downloadUrl}
            download={release.fileName}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download APK
          </a>
        </div>
      ) : (
        <Notice tone="info">
          <strong>APK binary not uploaded yet.</strong> The mobile app source and direct APK build
          profile (<code className="font-mono">apps/mobile/eas.json</code>) are ready. Build and
          upload the APK (or drop <code className="font-mono">easydel-android.apk</code> into{' '}
          <code className="font-mono">apps/web/public/downloads/</code>) and this banner turns into a
          direct download button automatically.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Current build status">
          <div className="p-5">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-panel-2">
              <Smartphone className="h-6 w-6 text-accent" aria-hidden />
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="font-medium text-ink">APK available</dt>
                <dd className="text-ink-dim">{release.available ? 'Yes' : 'Ready to build'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-medium text-ink">Version</dt>
                <dd className="tabular-nums text-ink-dim">v{release.version}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-medium text-ink">Distribution</dt>
                <dd className="text-ink-dim">Direct sideload APK (no Play Store)</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-medium text-ink">Storage source</dt>
                <dd className="text-ink-dim">{release.source}</dd>
              </div>
            </dl>

            <h3 className="mt-5 text-sm font-semibold text-ink">Included in the mobile app</h3>
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

        <Card title="Direct APK release checklist" description="Steps from code to website download.">
          <ol className="divide-y divide-line/70">
            {PHASES.map((p, i) => (
              <li key={p.label} className="flex items-start gap-3 px-5 py-3">
                {p.done || release.available ? (
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
                ) : (
                  <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                )}
                <div>
                  <p className="text-sm font-medium text-ink">Step {i + 1}</p>
                  <p className="text-sm text-ink-dim">{p.label}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card title="How to build & publish the APK" description="Direct install without Play Store.">
        <ol className="list-decimal space-y-2 px-5 py-5 pl-10 text-sm text-ink-dim">
          <li>
            Inside <code className="font-mono">apps/mobile</code>, run{' '}
            <code className="font-mono">npx eas build -p android --profile preview</code> (or locally
            with Android Studio: <code className="font-mono">npx expo run:android --variant release</code>).
          </li>
          <li>
            Save the output <code className="font-mono">.apk</code> to{' '}
            <code className="font-mono">apps/web/public/downloads/easydel-android.apk</code>, set{' '}
            <code className="font-mono">APK_DOWNLOAD_URL</code>, or upload it to Supabase bucket{' '}
            <code className="font-mono">app-releases/easydel-latest.apk</code>.
          </li>
          <li>
            Riders tap <strong>Download APK</strong> on this page from their phone browser and
            allow installing from Chrome/browser once.
          </li>
        </ol>
      </Card>
    </>
  );
}
