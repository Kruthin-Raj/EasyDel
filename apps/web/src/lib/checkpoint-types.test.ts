import { describe, it, expect } from 'vitest';
import {
  parseCheckpointTypes,
  checkpointTypesKey,
  DEFAULT_CHECKPOINT_TYPES,
} from './permissions';
import { parseNameOptions, readNameOptions, roundTypeOptions } from './name-options';

/*
 * Two lists feed the checkpoint form's dropdowns, and both had to be isolated
 * per person:
 *
 *   package types  — was a single global Setting row, so one agent editing it
 *                    replaced every other agent's list
 *   house names    — pasted per round, so already scoped to a session
 */

const AGENT_A = 'user-aaa';
const AGENT_B = 'user-bbb';

describe('parseCheckpointTypes — per-agent package types', () => {
  it('falls back to the built-in defaults when nothing is configured', () => {
    expect(parseCheckpointTypes({})).toEqual(DEFAULT_CHECKPOINT_TYPES);
    expect(parseCheckpointTypes({}, AGENT_A)).toEqual(DEFAULT_CHECKPOINT_TYPES);
  });

  it("uses the team's shared list when an agent has not customised theirs", () => {
    const settings = { checkpoint_type_options: 'Crate\nSack' };
    expect(parseCheckpointTypes(settings, AGENT_A)).toEqual(['Crate', 'Sack']);
  });

  it("prefers an agent's own list over the shared one", () => {
    const settings = {
      checkpoint_type_options: 'Crate\nSack',
      [checkpointTypesKey(AGENT_A)]: 'Fruit box\nMilk',
    };
    expect(parseCheckpointTypes(settings, AGENT_A)).toEqual(['Fruit box', 'Milk']);
  });

  it("does NOT leak one agent's list to another agent", () => {
    const settings = {
      checkpoint_type_options: 'Crate\nSack',
      [checkpointTypesKey(AGENT_A)]: 'Fruit box\nMilk',
    };
    // B never customised, so B sees the shared list — not A's.
    const forB = parseCheckpointTypes(settings, AGENT_B);
    expect(forB).toEqual(['Crate', 'Sack']);
    expect(forB).not.toContain('Fruit box');
    expect(forB).not.toContain('Milk');
  });

  it('keeps two customised agents independent', () => {
    const settings = {
      [checkpointTypesKey(AGENT_A)]: 'Fruit box',
      [checkpointTypesKey(AGENT_B)]: 'Newspaper',
    };
    expect(parseCheckpointTypes(settings, AGENT_A)).toEqual(['Fruit box']);
    expect(parseCheckpointTypes(settings, AGENT_B)).toEqual(['Newspaper']);
  });

  it('ignores a blank personal list rather than showing an empty dropdown', () => {
    const settings = {
      checkpoint_type_options: 'Crate',
      [checkpointTypesKey(AGENT_A)]: '   \n  \n',
    };
    expect(parseCheckpointTypes(settings, AGENT_A)).toEqual(['Crate']);
  });

  it('omitting the user id yields the shared list, for the admin view', () => {
    const settings = {
      checkpoint_type_options: 'Crate',
      [checkpointTypesKey(AGENT_A)]: 'Fruit box',
    };
    expect(parseCheckpointTypes(settings)).toEqual(['Crate']);
  });

  it('namespaced keys cannot collide with the shared key', () => {
    expect(checkpointTypesKey(AGENT_A)).not.toBe('checkpoint_type_options');
    expect(checkpointTypesKey(AGENT_A)).not.toBe(checkpointTypesKey(AGENT_B));
  });
});

describe('roundTypeOptions — package types are isolated route to route', () => {
  const TEAM = ['Large package', 'Small package'];

  it("uses the round's own list when one was pasted", () => {
    expect(
      roundTypeOptions({ stored: 'Big box\nFruit crate', fallback: TEAM }),
    ).toEqual(['Big box', 'Fruit crate']);
  });

  it('keeps two rounds independent', () => {
    const roundOne = roundTypeOptions({ stored: 'Fruit crate', fallback: TEAM });
    const roundTwo = roundTypeOptions({ stored: 'Newspaper bundle', fallback: TEAM });

    expect(roundOne).toEqual(['Fruit crate']);
    expect(roundTwo).toEqual(['Newspaper bundle']);
    expect(roundOne).not.toContain('Newspaper bundle');
    expect(roundTwo).not.toContain('Fruit crate');
  });

  it('remembers a type already used on this round, without configuration', () => {
    const options = roundTypeOptions({
      stored: null,
      usedOnRound: ['Milk crate', null, 'Milk crate'],
      fallback: TEAM,
    });
    // Used-on-round comes first, deduplicated, then the fallback list.
    expect(options).toEqual(['Milk crate', 'Large package', 'Small package']);
  });

  it('does not duplicate a used type that is also in the fallback list', () => {
    const options = roundTypeOptions({
      stored: null,
      usedOnRound: ['Large package'],
      fallback: TEAM,
    });
    expect(options).toEqual(['Large package', 'Small package']);
    expect(options.filter((o) => o === 'Large package')).toHaveLength(1);
  });

  it('is case-insensitive when deduplicating, keeping what was recorded', () => {
    const options = roundTypeOptions({
      stored: null,
      usedOnRound: ['LARGE PACKAGE'],
      fallback: TEAM,
    });
    expect(options).toEqual(['LARGE PACKAGE', 'Small package']);
  });

  it('falls back cleanly when the round has nothing of its own', () => {
    expect(roundTypeOptions({ stored: null, fallback: TEAM })).toEqual(TEAM);
    expect(roundTypeOptions({ stored: '  \n ', fallback: TEAM })).toEqual(TEAM);
  });

  it('never returns blanks, even from messy stored data', () => {
    const options = roundTypeOptions({
      stored: null,
      usedOnRound: ['', '   ', null],
      fallback: TEAM,
    });
    expect(options).toEqual(TEAM);
    expect(options.every((o) => o.trim().length > 0)).toBe(true);
  });
});

describe('parseNameOptions — the round’s house-name list', () => {
  it('drops blank lines and trims each name', () => {
    expect(parseNameOptions('  Mr Sharma \n\n  Corner shop  \n')).toEqual([
      'Mr Sharma',
      'Corner shop',
    ]);
  });

  it('removes duplicates case-insensitively, keeping the first spelling', () => {
    expect(parseNameOptions('Corner Shop\ncorner shop\nCORNER SHOP')).toEqual(['Corner Shop']);
  });

  it('preserves the order they were pasted in', () => {
    expect(parseNameOptions('Zeta\nAlpha\nMid')).toEqual(['Zeta', 'Alpha', 'Mid']);
  });

  it('handles CRLF, since names are usually pasted from Windows or a phone', () => {
    expect(parseNameOptions('One\r\nTwo')).toEqual(['One', 'Two']);
  });

  it('caps a single name so it cannot exceed the checkpoint name column', () => {
    expect(parseNameOptions('x'.repeat(500))[0]).toHaveLength(120);
  });

  it('caps the list length rather than accepting an unbounded paste', () => {
    const huge = Array.from({ length: 1000 }, (_, i) => `House ${i}`).join('\n');
    expect(parseNameOptions(huge)).toHaveLength(300);
  });

  it('returns nothing for empty or absent input', () => {
    expect(parseNameOptions('')).toEqual([]);
    expect(parseNameOptions('\n \n')).toEqual([]);
    expect(readNameOptions(null)).toEqual([]);
    expect(readNameOptions(undefined)).toEqual([]);
  });

  it('round-trips through the stored newline-joined column', () => {
    const names = parseNameOptions('Mr Sharma\nAvengers Tower\nCorner shop');
    expect(readNameOptions(names.join('\n'))).toEqual(names);
  });
});
