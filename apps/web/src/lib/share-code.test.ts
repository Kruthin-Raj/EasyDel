import { describe, it, expect } from 'vitest';
import {
  SHARE_CODE_ALPHABET,
  SHARE_CODE_LENGTH,
  generateShareCode,
  normalizeShareInput,
  formatSharePath,
} from './share-code';

describe('generateShareCode', () => {
  it('generates codes of the expected length using only unambiguous characters', () => {
    for (let i = 0; i < 40; i++) {
      const code = generateShareCode();
      expect(code).toHaveLength(SHARE_CODE_LENGTH);
      for (const ch of code) {
        expect(SHARE_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it('never contains ambiguous characters 0, O, 1, I, L', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateShareCode();
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });
});

describe('normalizeShareInput', () => {
  it('normalises lowercase and hyphenated codes', () => {
    expect(normalizeShareInput('k7m9-p2x4')).toBe('K7M9P2X4');
    expect(normalizeShareInput('  morn 0001  ')).toBe('MORN0001');
  });

  it('extracts the code from full share URLs and relative share paths', () => {
    expect(normalizeShareInput('https://easydel.vercel.app/share/k7m9p2x4')).toBe('K7M9P2X4');
    expect(normalizeShareInput('http://localhost:3000/share/K7M9-P2X4?ref=wa')).toBe('K7M9P2X4');
    expect(normalizeShareInput('/share/morn0001/')).toBe('MORN0001');
  });

  it('rejects empty, malformed, or non-share URLs', () => {
    expect(normalizeShareInput('')).toBeNull();
    expect(normalizeShareInput('   ')).toBeNull();
    expect(normalizeShareInput('ab')).toBeNull();
    expect(normalizeShareInput('https://easydel.vercel.app/routes/123')).toBeNull();
    expect(normalizeShareInput('hello world!!')).toBeNull();
  });
});

describe('formatSharePath', () => {
  it('builds the /share/ path for a code', () => {
    expect(formatSharePath('K7M9P2X4')).toBe('/share/K7M9P2X4');
  });
});
