import Link from 'next/link';
import { BookOpen, Camera, Compass, Lock, MapPin, Share2, Sparkles } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import PublicShell from '@/components/PublicShell';
import { Card, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'About — EasyDel',
  description:
    'Learn how EasyDel helps newspaper carriers and delivery riders record, share, memorize, and run routes stop by stop.',
};

const STEPS = [
  {
    step: '01',
    title: 'Record or build your round',
    description:
      'Drive a new route once with GPS logging, snap house photos, add floor/gate instructions, and save notes for the next delivery — or paste Google Maps links and CSV files.',
    icon: Camera,
  },
  {
    step: '02',
    title: 'Optimise automatically',
    description:
      'EasyDel orders stops using nearest-neighbour + 2-opt optimisation and road distances via OSRM, keeping every route edit as a clean immutable version.',
    icon: Compass,
  },
  {
    step: '03',
    title: 'Share by unique code or link',
    description:
      'Every route has its own 8-character code and share link. Anyone joining a beat saves it straight into their personal route list with one tap.',
    icon: Share2,
  },
  {
    step: '04',
    title: 'Memorize & deliver solo',
    description:
      'New riders step through every house photo, package count, and next-visit note — or switch on Quiz mode — before running their own private delivery round.',
    icon: BookOpen,
  },
];

const PRINCIPLES = [
  {
    icon: Lock,
    title: 'Private personal history',
    body: 'Every user owns their own saved locations, recorded rounds, and delivery outcomes. Sharing a route gives others the stops and photos they need to deliver—never your private delivery logs.',
  },
  {
    icon: MapPin,
    title: 'Open maps, zero lock-in',
    body: 'Built on OpenStreetMap, MapLibre GL, and OSRM road routing so route visualisations stay fast even on low-end Android phones at 5:30 AM.',
  },
  {
    icon: Sparkles,
    title: 'Built for real morning beats',
    body: 'Multi-customer buildings stay grouped under one stop, large phone photos are resized automatically before upload, and next-visit notes carry forward to tomorrow’s visit.',
  },
];

export default async function AboutPage() {
  const user = await getSessionUser();

  return (
    <PublicShell activePath="/about">
      <PageHeader
        eyebrow="About EasyDel"
        title="Learn a new delivery route in one day, run it cleanly every morning."
        subtitle="EasyDel is an open, peer-to-peer route companion built for newspaper carriers, milk runners, and local couriers who need reliable stop memory—not complex admin bureaucracy."
        actions={
          <>
            {user ? (
              <>
                <Link
                  href="/routes"
                  className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
                >
                  Open my routes
                </Link>
                <Link
                  href="/contact"
                  className="rounded-lg bg-surface-2 px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
                >
                  Contact support
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/signup"
                  className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
                >
                  Create free account
                </Link>
                <Link
                  href="/login"
                  className="rounded-lg bg-surface-2 px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
                >
                  Sign in
                </Link>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((item) => (
          <Card key={item.step} className="flex flex-col justify-between p-5">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <span className="numeric rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent ring-1 ring-inset ring-accent/30">
                  STEP {item.step}
                </span>
                <item.icon className="h-4 w-4 text-ink-faint" aria-hidden />
              </div>
              <h2 className="text-base font-semibold text-ink">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-dim">{item.description}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {PRINCIPLES.map((p) => (
          <Card key={p.title} className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-panel-2 text-accent ring-1 ring-inset ring-line-bright">
              <p.icon className="h-4 w-4" aria-hidden />
            </div>
            <h2 className="text-sm font-semibold text-ink">{p.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">{p.body}</p>
          </Card>
        ))}
      </div>

      <Card
        title="Ready to get started?"
        description="Whether you are creating your own beat or learning a route shared by a teammate."
      >
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="max-w-xl text-sm text-ink-dim">
            Use <strong className="font-semibold text-ink">Record a route</strong> when riding a beat
            for the first time, <strong className="font-semibold text-ink">Join by code</strong> when
            someone shares an 8-character route code with you, or reach out via{' '}
            <Link href="/contact" className="text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent">
              Contact us
            </Link>{' '}
            with feedback.
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={user ? '/record' : '/signup'}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
            >
              {user ? 'Record a round' : 'Create account'}
            </Link>
            <Link
              href="/contact"
              className="rounded-lg bg-surface-2 px-4 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              Contact us
            </Link>
          </div>
        </div>
      </Card>
    </PublicShell>
  );
}
