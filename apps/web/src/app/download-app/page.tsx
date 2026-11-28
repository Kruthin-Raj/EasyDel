import Link from 'next/link';
import PublicShell from '@/components/PublicShell';
import { resolveApkRelease } from '@/lib/app-release';
import { PageHeader, Card, Notice } from '@/components/ui';
import { Smartphone, CircleCheck, CircleDashed, Download, Globe } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Download EasyDel App — EasyDel',
  description:
    'Download the EasyDel Android app (.apk) directly from our website without Play Store.',
};

const FEATURES = [
  'Logo splash + instant "Continue without login" preview mode',
  'Open any shared route or house by 8-letter code (or try DEMO2026)',
  'Record rounds live with GPS, house clues & next-visit reminders',
  'Build routes directly from Google Maps links or saved locations',
  'Offline SQLite cache & Memorize flashcard quiz mode',
  'Delivery History, Reports, Issues & Settings sync',
];

function formatBytes(bytes: number | null) {
  if (!bytes || bytes <= 0) return '—';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DownloadAppPage() {
  const release = await resolveApkRelease();

  return (
    <PublicShell activePath="/download-app">
      <PageHeader
        eyebrow="Mobile app"
        title="Download EasyDel for Android"
        subtitle="Fast, offline-ready delivery app installed straight from this website — no Play Store account required."
        actions={
          <Link
            href="/login"
            className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
          >
            Web console
          </Link>
        }
      />

      {release.available && release.downloadUrl ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ok/40 bg-ok-dim/30 p-5">
          <div>
            <p className="eyebrow text-ok">Ready for Android</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">
              EasyDel Mobile v{release.version} (.apk)
            </h2>
            <p className="mt-1 text-xs text-ink-dim">
              Direct APK · Size: {formatBytes(release.sizeBytes)}
              {release.updatedAt ? ` · Updated ${release.updatedAt.slice(0, 10)}` : ''}
            </p>
          </div>
          <a
            href={release.downloadUrl}
            download={release.fileName}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download APK now
          </a>
        </div>
      ) : (
        <Notice tone="info">
          <strong>APK build not uploaded yet:</strong> Once you build the Android APK (`npx eas
          build -p android --profile preview` inside <code className="font-mono">apps/mobile</code>{' '}
          or GitHub Action <code className="font-mono">Build Android APK</code>) and place it at{' '}
          <code className="font-mono">apps/web/public/downloads/easydel-android.apk</code> (or
          Supabase bucket <code className="font-mono">app-releases/easydel-latest.apk</code>), the{' '}
          <strong>Download APK now</strong> button appears right here for everyone.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Why use the mobile app">
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-inset ring-accent/30">
                <Smartphone className="h-5 w-5 text-accent" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Built for the 5:30 AM beat</p>
                <p className="text-xs text-ink-dim">
                  Local SQLite cache keeps stops &amp; quiz flashcards instant even offline.
                </p>
              </div>
            </div>

            <ul className="space-y-2">
              {FEATURES.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-ink-dim">
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title="How to install on Android" description="Takes under a minute.">
          <ol className="list-decimal space-y-3 px-5 py-5 pl-10 text-sm text-ink-dim">
            <li>
              Tap <strong className="text-ink">Download APK now</strong> above from Chrome or your
              phone browser.
            </li>
            <li>
              Tap the finished <code className="font-mono">easydel-android.apk</code> notification.
            </li>
            <li>
              If Android asks, allow <strong className="text-ink">Install unknown apps</strong> for
              your browser once, then tap <strong className="text-ink">Install</strong>.
            </li>
            <li>
              Open <strong className="text-ink">EasyDel</strong> — you can sign in or tap{' '}
              <strong className="text-ink">Continue without login</strong> right away.
            </li>
          </ol>

          <div className="border-t border-line px-5 py-4 text-xs text-ink-dim">
            <p className="flex items-center gap-1.5 font-medium text-ink">
              <Globe className="h-3.5 w-3.5 text-accent" aria-hidden />
              Also installable as a Web App
            </p>
            <p className="mt-1">
              On iPhone or desktop Chrome, open your EasyDel URL and choose{' '}
              <strong>Add to Home Screen / Install app</strong> from the browser menu.
            </p>
          </div>
        </Card>
      </div>

      <Card title="Release checklist for app owner" description="For publishing the APK file.">
        <ul className="divide-y divide-line/70">
          {[
            { done: true, text: 'All web features built into apps/mobile (Home, Code Sharing, Maps Links, Record, Locations, Memorize, Deliver, Reports, Settings)' },
            { done: true, text: 'Public /download-app page & /api/app-release metadata endpoint' },
            { done: release.available, text: 'Build signed .apk & upload to public/downloads/easydel-android.apk or Supabase Storage' },
          ].map((row) => (
            <li key={row.text} className="flex items-start gap-3 px-5 py-3 text-sm text-ink-dim">
              {row.done ? (
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
              ) : (
                <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
              )}
              <span>{row.text}</span>
            </li>
          ))}
        </ul>
      </Card>
    </PublicShell>
  );
}
