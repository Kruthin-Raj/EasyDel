'use client';

import { useState, useSyncExternalStore } from 'react';
import { Check, Copy, Link2, RefreshCw, Share2 } from 'lucide-react';
import { formatSharePath } from '@/lib/share-code';
import { regenerateShareCodeAction } from '@/lib/share-actions';

const emptySubscribe = () => () => {};

/**
 * Displays a route's unique share code and shareable link, with one-tap copy
 * and optional code rotation for the route creator.
 */
export default function ShareRouteCard({
  routeId,
  routeName,
  shareCode,
  isOwner,
  compact = false,
}: {
  routeId: string;
  routeName: string;
  shareCode: string;
  isOwner: boolean;
  compact?: boolean;
}) {
  const path = formatSharePath(shareCode);
  const origin = useSyncExternalStore(
    emptySubscribe,
    () => window.location.origin,
    () => '',
  );
  const canShare = useSyncExternalStore(
    emptySubscribe,
    () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    () => false,
  );
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const fullUrl = origin ? `${origin}${path}` : path;

  async function copy(kind: 'code' | 'link', value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied((prev) => (prev === kind ? null : prev)), 2000);
    } catch {
      // Clipboard API unavailable in non-secure contexts; user can still select text.
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({
        title: routeName,
        text: `Save and memorize "${routeName}" on EasyDel (Code: ${shareCode})`,
        url: fullUrl,
      });
    } catch {
      // User dismissed share sheet.
    }
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <code className="numeric rounded-md bg-surface-2 px-2 py-1 text-xs font-semibold text-accent ring-1 ring-inset ring-accent/30">
          {shareCode}
        </code>
        <button
          type="button"
          onClick={() => copy('code', shareCode)}
          title="Copy route code"
          className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-ink-dim ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2 hover:text-ink"
        >
          {copied === 'code' ? <Check className="h-3 w-3 text-ok" /> : <Copy className="h-3 w-3" />}
          <span>{copied === 'code' ? 'Copied' : 'Code'}</span>
        </button>
        <button
          type="button"
          onClick={() => copy('link', fullUrl)}
          title="Copy share link"
          className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-ink-dim ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2 hover:text-ink"
        >
          {copied === 'link' ? <Check className="h-3 w-3 text-ok" /> : <Link2 className="h-3 w-3" />}
          <span>{copied === 'link' ? 'Copied' : 'Link'}</span>
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-panel">
      <header className="border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Share2 className="h-4 w-4 text-accent" aria-hidden />
          Share this route
        </h2>
        <p className="mt-1 text-xs text-ink-dim">
          Anyone with this code or link can save this route to their list, memorize the stops, and
          deliver based on it.
        </p>
      </header>

      <div className="space-y-4 p-5">
        <div>
          <p className="eyebrow text-ink-faint">Route code</p>
          <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2.5 ring-1 ring-inset ring-line-bright">
            <code className="numeric select-all text-lg font-semibold tracking-wider text-accent">
              {shareCode}
            </code>
            <button
              type="button"
              onClick={() => copy('code', shareCode)}
              className="inline-flex items-center gap-1.5 rounded-md bg-panel-2 px-2.5 py-1.5 text-xs font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel"
            >
              {copied === 'code' ? (
                <Check className="h-3.5 w-3.5 text-ok" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
              {copied === 'code' ? 'Copied!' : 'Copy code'}
            </button>
          </div>
        </div>

        <div>
          <p className="eyebrow text-ink-faint">Share link</p>
          <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 ring-1 ring-inset ring-line">
            <span className="truncate font-mono text-xs text-ink-dim select-all">{fullUrl}</span>
            <button
              type="button"
              onClick={() => copy('link', fullUrl)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-panel-2 px-2.5 py-1.5 text-xs font-medium text-ink ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel"
            >
              {copied === 'link' ? (
                <Check className="h-3.5 w-3.5 text-ok" aria-hidden />
              ) : (
                <Link2 className="h-3.5 w-3.5" aria-hidden />
              )}
              {copied === 'link' ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {canShare && (
            <button
              type="button"
              onClick={nativeShare}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden />
              Share via…
            </button>
          )}

          {isOwner && (
            <form action={regenerateShareCodeAction}>
              <input type="hidden" name="routeId" value={routeId} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs font-medium text-ink-dim ring-1 ring-inset ring-line-bright transition-colors hover:bg-panel-2 hover:text-ink"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Generate new code
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
