import type { ReactNode } from 'react';

/*
 * Shared presentational primitives for the operations console.
 *
 * Contrast floor: `ink-dim` (#9fb0c2 on #131b25 ≈ 7.2:1) is the lightest tone
 * permitted for text that carries meaning. `ink-faint` is for decoration and
 * placeholders only — never for a value the operator needs to read.
 *
 * Colours come exclusively from the semantic tokens in globals.css. No page
 * should reference a raw palette class like `slate-700`.
 */

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2 text-accent">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-ink-dim">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  children,
  className = '',
  title,
  description,
  aside,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-panel shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_8px_24px_-12px_rgba(0,0,0,0.6)] ${className}`}
    >
      {(title || description || aside) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>}
            {description && <p className="mt-1 text-sm text-ink-dim">{description}</p>}
          </div>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

const TONE_TEXT: Record<string, string> = {
  neutral: 'text-ink',
  positive: 'text-ok',
  warning: 'text-warn',
  critical: 'text-bad',
  info: 'text-info',
  accent: 'text-accent',
};

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  live = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: keyof typeof TONE_TEXT;
  live?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-bright">
      {/* Top hairline picks up the tone colour — a quiet way to code the tile. */}
      <span
        aria-hidden
        className={`absolute inset-x-0 top-0 h-px ${
          tone === 'neutral' ? 'bg-line-bright' : 'bg-current'
        } ${TONE_TEXT[tone]} opacity-70`}
      />
      <div className="flex items-center gap-1.5">
        <p className="eyebrow text-ink-faint">{label}</p>
        {live && (
          <span
            aria-label="live"
            className="live-dot ml-auto h-1.5 w-1.5 rounded-full bg-ok"
          />
        )}
      </div>
      <p className={`numeric mt-3 text-3xl font-semibold ${TONE_TEXT[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-dim">{hint}</p>}
    </div>
  );
}

/*
 * Status badge. Every lifecycle and delivery status maps to one of four
 * signals so a scan of the page reads as a signal board: green good, amber
 * waiting, red wrong, grey inert.
 */
const BADGE_TONES: Record<string, string> = {
  ACTIVE: 'bg-ok-dim text-ok ring-ok/30',
  DELIVERED: 'bg-ok-dim text-ok ring-ok/30',
  APPROVED: 'bg-ok-dim text-ok ring-ok/30',
  RESOLVED: 'bg-ok-dim text-ok ring-ok/30',
  PAUSED: 'bg-warn-dim text-warn ring-warn/30',
  PENDING: 'bg-warn-dim text-warn ring-warn/30',
  PENDING_REVIEW: 'bg-warn-dim text-warn ring-warn/30',
  IN_PROGRESS: 'bg-info-dim text-info ring-info/30',
  MOVED: 'bg-info-dim text-info ring-info/30',
  CANCELLED: 'bg-bad-dim text-bad ring-bad/30',
  FAILED: 'bg-bad-dim text-bad ring-bad/30',
  OPEN: 'bg-bad-dim text-bad ring-bad/30',
  DRAFT: 'bg-idle-dim text-idle ring-idle/25',
  SKIPPED: 'bg-idle-dim text-idle ring-idle/25',
  ARCHIVED: 'bg-idle-dim text-idle ring-idle/25',
  EXPIRED: 'bg-idle-dim text-idle ring-idle/25',
  ADMIN: 'bg-accent-dim/40 text-accent ring-accent/30',
  MENTOR: 'bg-info-dim text-info ring-info/30',
  DELIVERY_AGENT: 'bg-idle-dim text-idle ring-idle/25',
};

export function Badge({ children }: { children: string }) {
  const tone = BADGE_TONES[children] ?? 'bg-idle-dim text-idle ring-idle/25';
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-wider ring-1 ring-inset ${tone}`}
    >
      <span aria-hidden className="h-1 w-1 rounded-full bg-current" />
      {children.replace(/_/g, ' ')}
    </span>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-panel-2 text-left">
            {head.map((h) => (
              <th key={h} scope="col" className="eyebrow whitespace-nowrap px-5 py-3 text-ink-faint">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70 text-ink-dim">{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <tr className="align-top transition-colors hover:bg-panel-2/60">{children}</tr>;
}

export function Td({
  children,
  className = '',
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-5 py-3 ${className}`}>
      {children}
    </td>
  );
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="px-5 py-14 text-center">
      {/* Dashed square reads as "slot with nothing in it" rather than an error. */}
      <div
        aria-hidden
        className="mx-auto mb-4 h-10 w-10 rounded-lg border border-dashed border-line-bright"
      />
      <p className="text-sm font-medium text-ink">{message}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-dim">{hint}</p>}
    </div>
  );
}

const BUTTON_VARIANTS = {
  primary:
    'bg-accent text-accent-ink hover:bg-accent-bright focus-visible:outline-accent font-semibold',
  secondary:
    'bg-surface-2 text-ink ring-1 ring-inset ring-line-bright hover:bg-panel-2 hover:ring-ink-faint focus-visible:outline-ink-faint',
  danger:
    'bg-bad-dim text-bad ring-1 ring-inset ring-bad/40 hover:bg-bad hover:text-surface focus-visible:outline-bad',
  ghost: 'text-ink-dim hover:bg-panel-2 hover:text-ink focus-visible:outline-ink-faint',
};

export function Button({
  children,
  variant = 'primary',
  type = 'submit',
  name,
  value,
  className = '',
  title,
}: {
  children: ReactNode;
  variant?: keyof typeof BUTTON_VARIANTS;
  type?: 'submit' | 'button';
  name?: string;
  value?: string;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type={type}
      name={name}
      value={value}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  name,
  type = 'text',
  required,
  defaultValue,
  placeholder,
  hint,
  step,
  autoComplete,
  inputMode,
  maxLength,
  className = '',
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
  hint?: string;
  step?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'email' | 'tel';
  maxLength?: number;
  className?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="text-accent" aria-hidden>
            *
          </span>
        )}
      </span>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        className={`field ${className}`}
      />
      {hint && <span className="mt-1.5 block text-xs text-ink-dim">{hint}</span>}
    </label>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  placeholder,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="field resize-y"
      />
    </label>
  );
}

export function Select({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <select name={name} defaultValue={defaultValue} className="field">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Inline banner, used to state plainly when something is not yet wired up. */
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warning';
}) {
  const tones = {
    info: 'bg-info-dim/50 text-ink ring-info/25 before:bg-info',
    warning: 'bg-warn-dim/50 text-ink ring-warn/25 before:bg-warn',
  };
  return (
    <div
      className={`relative overflow-hidden rounded-lg px-4 py-3 pl-5 text-sm ring-1 ring-inset before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-[''] ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

/** Horizontal strip of figures — the console's summary bar. */
export function MetricStrip({
  items,
}: {
  items: { label: string; value: string; tone?: keyof typeof TONE_TEXT }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
      {items.map((m) => (
        <div key={m.label} className="bg-panel px-5 py-4">
          <p className="eyebrow text-ink-faint">{m.label}</p>
          <p className={`numeric mt-2 text-xl font-semibold ${TONE_TEXT[m.tone ?? 'neutral']}`}>
            {m.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- formatters --- */

export function metres(m?: number | null) {
  if (m == null) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function duration(s?: number | null) {
  if (s == null) return '—';
  const h = Math.floor(s / 3600);
  const min = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

export function when(d?: Date | null) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Coordinates in the console's monospace convention. */
export function coords(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
