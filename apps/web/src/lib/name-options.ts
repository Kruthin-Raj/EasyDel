/**
 * The optional list of house/customer names an agent pastes before a round.
 *
 * Stored newline-separated on the training session and offered as a dropdown
 * on the checkpoint form, so a long name can be picked instead of typed at the
 * gate. It is a shortcut, never a constraint — the field still accepts anything.
 *
 * Lives here rather than in `recording-actions.ts` because that file is
 * `'use server'`, and such a module may only export async functions.
 */

/** Max names accepted for one round. Generous, but not unbounded. */
export const MAX_NAME_OPTIONS = 300;

/** Longest single name kept, matching the checkpoint name column. */
const MAX_NAME_LENGTH = 120;

/**
 * Splits a pasted block into a clean list: blank lines dropped, duplicates
 * removed case-insensitively, original order preserved.
 */
export function parseNameOptions(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const name = line.trim().slice(0, MAX_NAME_LENGTH);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(name);
    if (out.length >= MAX_NAME_OPTIONS) break;
  }
  return out;
}

/** Reads the stored column back into a list. */
export function readNameOptions(stored: string | null | undefined): string[] {
  return stored ? parseNameOptions(stored) : [];
}

/**
 * The package types offered while recording one round.
 *
 * Resolution order, most specific first:
 *
 *   1. `typeOptions` — the list pasted for THIS round
 *   2. types already recorded at a checkpoint on this round, so a type used
 *      once is offered again without anyone configuring anything
 *   3. `fallback` — the agent's own list, else the team's, else the defaults
 *      (resolved by parseCheckpointTypes)
 *
 * Per-round because what is being carried changes from route to route. The
 * shared Settings row is one value for the whole team, so treating it as the
 * only source made one agent's edit everybody's.
 */
export function roundTypeOptions({
  stored,
  usedOnRound = [],
  fallback,
}: {
  stored: string | null | undefined;
  usedOnRound?: (string | null)[];
  fallback: string[];
}): string[] {
  const own = stored ? parseNameOptions(stored) : [];
  if (own.length > 0) return own;

  // Preserve first-seen order, drop blanks, compare case-insensitively.
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const value of [...usedOnRound, ...fallback]) {
    const type = (value ?? '').trim();
    if (!type) continue;
    const key = type.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(type);
  }
  return merged;
}
