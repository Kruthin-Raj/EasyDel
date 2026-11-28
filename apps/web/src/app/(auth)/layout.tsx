import Link from 'next/link';

/**
 * Chrome-free shell for sign in / sign up / verify / password reset.
 *
 * Deliberately asymmetric: the brand and standing claim sit on a left rail,
 * the form on the right. A centred card on an empty field is the single most
 * generic auth layout there is, and this product is a console — it should look
 * like one from the first screen.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Left rail — hidden on small screens where it would just push the form down. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface-2 p-10 lg:flex">
        {/* Concentric rings, echoing a radar sweep. Purely atmospheric. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 top-1/2 h-[46rem] w-[46rem] -translate-y-1/2 rounded-full opacity-[0.13]"
          style={{
            background:
              'repeating-radial-gradient(circle at center, var(--color-accent) 0 1px, transparent 1px 68px)',
          }}
        />

        <Link href="/login" className="relative inline-flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-ink">EasyDel</span>
          <span className="eyebrow text-accent">route manager</span>
        </Link>

        <div className="relative max-w-md">
          <p className="eyebrow mb-4 text-accent">Route companion</p>
          <h2 className="text-3xl font-semibold leading-tight text-ink">
            Create routes, share a code, memorize every stop, and deliver.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-dim">
            Built on OpenStreetMap, MapLibre and OSRM. Record a round once or paste
            map links, share it with a unique link or code, and let anyone learn and
            deliver the route stop by stop.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
            {[
              { k: 'Routing', v: 'OSRM' },
              { k: 'Basemap', v: 'OSM' },
              { k: 'Optimiser', v: '2-opt' },
            ].map((s) => (
              <div key={s.k} className="bg-panel px-4 py-3">
                <dt className="eyebrow text-ink-faint">{s.k}</dt>
                <dd className="numeric mt-1.5 text-sm font-semibold text-ink">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-4 text-xs text-ink-faint">
          <span>Route creation, sharing &amp; memorization platform.</span>
          <div className="flex items-center gap-4">
            <Link href="/download-app" className="font-medium text-accent transition-colors hover:text-accent-bright">
              Get Android App
            </Link>
            <Link href="/about" className="text-ink-dim transition-colors hover:text-accent">
              About
            </Link>
            <Link href="/contact" className="text-ink-dim transition-colors hover:text-accent">
              Contact us
            </Link>
          </div>
        </div>
      </aside>

      <main className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          {/* Compact brand for the mobile / narrow case. */}
          <Link href="/login" className="mb-8 inline-flex items-baseline gap-2 lg:hidden">
            <span className="text-lg font-semibold tracking-tight text-ink">EasyDel</span>
            <span className="eyebrow text-accent">route manager</span>
          </Link>
          {children}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-5 border-t border-line/70 pt-5 text-xs text-ink-dim lg:hidden">
            <Link href="/download-app" className="font-medium text-accent hover:text-accent-bright">
              Get Android App
            </Link>
            <Link href="/about" className="hover:text-accent">
              About
            </Link>
            <Link href="/contact" className="hover:text-accent">
              Contact us
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
