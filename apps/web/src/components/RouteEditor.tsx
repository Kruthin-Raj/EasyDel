'use client';

import { useState, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Link2, MapPin, Trash2, Loader2, Shuffle, TriangleAlert } from 'lucide-react';

type State = { error?: string; success?: string; info?: string } | null;

export type EditorStop = {
  id: string;
  locationId: string;
  sequence: number;
  name: string;
  address: string;
  status: string;
  items: number;
  distanceFromPrevious: number | null;
};

function Submit({
  label,
  pendingLabel,
  variant = 'primary',
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary: 'bg-accent text-accent-ink hover:bg-accent-bright disabled:bg-line-bright disabled:text-ink-faint',
    secondary:
      'bg-surface-2 text-ink ring-1 ring-inset ring-line-bright hover:bg-panel-2 disabled:opacity-60',
    danger:
      'bg-bad-dim text-bad ring-1 ring-inset ring-bad/40 hover:bg-bad hover:text-surface disabled:opacity-60',
  };
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles[variant]}`}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending ? pendingLabel : label}
    </button>
  );
}

function Banner({ state }: { state: State }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" data-testid="form-error" className="rounded-lg bg-bad-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-bad/30">
        {state.error}
      </p>
    );
  if (state.info)
    return (
      <p role="status" data-testid="form-info" className="rounded-lg bg-info-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-info/30">
        {state.info}
      </p>
    );
  if (state.success)
    return (
      <p role="status" data-testid="form-success" className="rounded-lg bg-ok-dim/60 px-4 py-3 text-sm text-ink ring-1 ring-inset ring-ok/30">
        {state.success}
      </p>
    );
  return null;
}

/**
 * Route editor: add stops by link or from an existing checkpoint, remove them,
 * re-optimise, and delete the route.
 *
 * Deleting is deliberately two-tier — archive keeps everything, permanent
 * delete is only offered when there is genuinely no history to destroy.
 */
export default function RouteEditor({
  routeId,
  routeName,
  stops,
  availableLocations,
  addByLinkAction,
  addFromLocationAction,
  removeStopAction,
  reoptimiseAction,
  deleteRouteAction,
  renameRouteAction,
  hasHistory,
  deliveryCount,
  runCount,
  isArchived,
}: {
  routeId: string;
  routeName: string;
  stops: EditorStop[];
  availableLocations: { id: string; name: string; address: string }[];
  addByLinkAction: (prev: State, formData: FormData) => Promise<State>;
  addFromLocationAction: (prev: State, formData: FormData) => Promise<State>;
  removeStopAction: (formData: FormData) => Promise<void>;
  reoptimiseAction: (formData: FormData) => Promise<void>;
  deleteRouteAction: (prev: State, formData: FormData) => Promise<State>;
  renameRouteAction: (prev: State, formData: FormData) => Promise<State>;
  hasHistory: boolean;
  deliveryCount: number;
  runCount: number;
  isArchived: boolean;
}) {
  const [tab, setTab] = useState<'link' | 'checkpoint'>('link');
  const [linkState, runLink] = useActionState(addByLinkAction, null);
  const [pickState, runPick] = useActionState(addFromLocationAction, null);
  const [deleteState, runDelete] = useActionState(deleteRouteAction, null);
  const [renameState, runRename] = useActionState(renameRouteAction, null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
      <div className="space-y-6">
        {/* ------------------------------- rename ------------------------------ */}
        <section className="rounded-xl border border-line bg-panel p-5">
          <form action={runRename} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-ink mb-1.5">Route name</label>
              <input name="name" defaultValue={routeName} required className="field" />
              <input type="hidden" name="routeId" value={routeId} />
            </div>
            <Submit label="Save name" pendingLabel="Saving…" />
          </form>
          <div className="mt-3">
            <Banner state={renameState} />
          </div>
        </section>

        {/* ------------------------------- stops ------------------------------ */}
        <section className="rounded-xl border border-line bg-panel">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Stops ({stops.length})</h2>
            <p className="mt-0.5 text-sm text-ink-dim">In optimised order.</p>
          </div>
          <form action={reoptimiseAction}>
            <input type="hidden" name="routeId" value={routeId} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
            >
              <Shuffle className="h-4 w-4" aria-hidden />
              Re-optimise
            </button>
          </form>
        </header>

        {stops.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-dim">
            This route has no stops. Add one from the panel beside this list.
          </p>
        ) : (
          <ul className="divide-y divide-line/70">
            {stops.map((stop) => (
              <li key={stop.id} className="flex items-start gap-3 px-5 py-3">
                <span className="numeric mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-panel-2 text-xs font-semibold text-ink-dim ring-1 ring-inset ring-line-bright">
                  {stop.sequence}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{stop.name}</p>
                  <p className="break-anywhere text-xs text-ink-dim">{stop.address}</p>
                  <p className="numeric mt-0.5 text-xs text-ink-faint">
                    {stop.items} item{stop.items === 1 ? '' : 's'}
                    {stop.distanceFromPrevious != null &&
                      ` · ${
                        stop.distanceFromPrevious >= 1000
                          ? `${(stop.distanceFromPrevious / 1000).toFixed(1)} km`
                          : `${Math.round(stop.distanceFromPrevious)} m`
                      } from previous`}
                  </p>
                  {stop.status !== 'ACTIVE' && (
                    <p className="mt-1 text-xs text-warn">
                      Location is {stop.status.toLowerCase()} — it will drop out on re-optimise.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <a
                    href={`/locations/${stop.locationId}/edit`}
                    target="_blank"
                    title={`Edit checkpoint`}
                    className="inline-flex items-center justify-center rounded-md p-2 text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    <span className="sr-only">Edit {stop.name}</span>
                  </a>
                  <form action={removeStopAction}>
                    <input type="hidden" name="routeId" value={routeId} />
                    <input type="hidden" name="stopId" value={stop.id} />
                    <button
                      type="submit"
                      title={`Remove ${stop.name} from this route`}
                      className="rounded-md p-2 text-ink-faint transition-colors hover:bg-bad-dim hover:text-bad"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Remove {stop.name} from this route</span>
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>

      <div className="space-y-6">
        {/* ---------------------------- add a stop --------------------------- */}
        <section className="rounded-xl border border-line bg-panel">
          <header className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Add a stop</h2>
          </header>

          {/* Two ways in: a fresh location (by link/coords), or a checkpoint already saved. */}
          <div className="flex gap-1 border-b border-line px-3 pt-3">
            {(
              [
                ['link', 'Create checkpoint', MapPin],
                ['checkpoint', 'Saved checkpoint', Link2],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm transition-colors ${
                  tab === key
                    ? 'bg-panel-2 font-medium text-ink'
                    : 'text-ink-dim hover:bg-panel-2/60 hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>

          {tab === 'link' ? (
            <form action={runLink} className="space-y-3 p-5">
              <Banner state={linkState} />
              <input type="hidden" name="routeId" value={routeId} />

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  Location (Map link or coordinates) <span className="text-accent">*</span>
                </span>
                <textarea
                  name="link"
                  rows={3}
                  required
                  placeholder="Paste a Google Maps link or Lat, Lng (e.g. 13.6288, 79.4192)"
                  className="field resize-y font-mono text-xs"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Checkpoint name</span>
                <input name="name" placeholder="Optional — automatically taken from the link if left blank" className="field" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Package</span>
                  <input name="productType" defaultValue="Package" className="field" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Qty</span>
                  <input name="quantity" type="number" min="1" defaultValue="1" className="field" />
                </label>
              </div>

              <Submit label="Add stop" pendingLabel="Adding…" />
            </form>
          ) : (
            <form action={runPick} className="space-y-3 p-5">
              <Banner state={pickState} />
              <input type="hidden" name="routeId" value={routeId} />

              {availableLocations.length === 0 ? (
                <p className="text-sm text-ink-dim">
                  Every active checkpoint is already on this route.
                </p>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">
                      Checkpoint <span className="text-accent">*</span>
                    </span>
                    <select name="locationId" required className="field" defaultValue="">
                      <option value="" disabled>
                        Choose a checkpoint…
                      </option>
                      {availableLocations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1.5 block text-xs text-ink-dim">
                      Checkpoints you recorded, imported or created earlier.
                    </span>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-ink">Package</span>
                      <input name="productType" defaultValue="Package" className="field" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-ink">Qty</span>
                      <input name="quantity" type="number" min="1" defaultValue="1" className="field" />
                    </label>
                  </div>
                  <p className="text-xs text-ink-dim">
                    Only used if the checkpoint has nothing to deliver yet.
                  </p>

                  <Submit label="Add checkpoint" pendingLabel="Adding…" />
                </>
              )}
            </form>
          )}
        </section>

        {/* ---------------------------- delete ------------------------------ */}
        {!isArchived && (
          <section className="rounded-xl border border-line bg-panel">
            <header className="border-b border-line px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <TriangleAlert className="h-4 w-4 text-bad" aria-hidden />
                Delete this route
              </h2>
            </header>

            <form action={runDelete} className="space-y-3 p-5">
              <Banner state={deleteState} />
              <input type="hidden" name="routeId" value={routeId} />

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Reason (optional)</span>
                <input name="reason" placeholder="e.g. round no longer served" className="field" />
              </label>

              {hasHistory ? (
                <>
                  <p className="rounded-lg bg-warn-dim/50 px-3 py-2.5 text-xs text-ink ring-1 ring-inset ring-warn/25">
                    This route has <strong className="font-semibold">{deliveryCount}</strong>{' '}
                    delivery record{deliveryCount === 1 ? '' : 's'} across {runCount} run
                    {runCount === 1 ? '' : 's'}. It can only be archived — deleting it would destroy
                    that history.
                  </p>
                  <input type="hidden" name="mode" value="archive" />
                  <Submit label="Archive route" pendingLabel="Archiving…" variant="danger" />
                </>
              ) : (
                <>
                  <p className="text-xs text-ink-dim">
                    This route has never been run, so there is no delivery history to lose.
                    Archiving keeps it out of the way; deleting removes it for good. Either way the
                    delivery locations and their subscriptions are untouched.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      name="mode"
                      value="archive"
                      className="inline-flex items-center justify-center rounded-lg bg-surface-2 px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2"
                    >
                      Archive
                    </button>
                    <button
                      type="submit"
                      name="mode"
                      value="permanent"
                      className="inline-flex items-center justify-center rounded-lg bg-bad-dim px-4 py-2.5 text-sm font-semibold text-bad ring-1 ring-inset ring-bad/40 transition-colors hover:bg-bad hover:text-surface"
                    >
                      Delete permanently
                    </button>
                  </div>
                </>
              )}
            </form>
          </section>
        )}

        {isArchived && (
          <section className="rounded-xl border border-line bg-panel p-5">
            <p className="text-sm text-ink-dim">
              <strong className="font-semibold text-ink">{routeName}</strong> is archived. It stays
              out of route lists and cannot be run until it is restored, but all of its history is
              intact.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
