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
          <p className="eyebrow mb-4 text-accent">Dispatch console</p>
          <h2 className="text-3xl font-semibold leading-tight text-ink">
            Every stop, every subscription, every driver — on one board.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-dim">
            Built on OpenStreetMap, MapLibre and OSRM. No per-request mapping
            bill, and no vendor deciding what your routing costs next quarter.
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

        <p className="relative text-xs text-ink-faint">
          Handles customer addresses and delivery history. Treat access accordingly.
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          {/* Compact brand for the mobile / narrow case. */}
          <Link href="/login" className="mb-8 inline-flex items-baseline gap-2 lg:hidden">
            <span className="text-lg font-semibold tracking-tight text-ink">EasyDel</span>
            <span className="eyebrow text-accent">route manager</span>
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
