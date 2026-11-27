import { randomBytes } from 'node:crypto';

/**
 * Human-friendly share codes for routes.
 *
 * Ambiguous characters (0/O, 1/I/L) are excluded so codes read over a call,
 * typed off a message, or written on a notepad are never misread.
 */
export const SHARE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SHARE_CODE_LENGTH = 8;

/** Generates a random uppercase code from the unambiguous alphabet. */
export function generateShareCode(length = SHARE_CODE_LENGTH): string {
  const n = SHARE_CODE_ALPHABET.length; // 31 -> largest multiple < 256 is 248 (31 * 8)
  const limit = Math.floor(256 / n) * n;
  let out = '';

  while (out.length < length) {
    const bytes = randomBytes(length * 2);
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      const b = bytes[i];
      if (b < limit) {
        out += SHARE_CODE_ALPHABET[b % n];
      }
    }
  }
  return out;
}

/**
 * Extracts a normalised uppercase route share code from either a bare code
 * (e.g. "k7m9-p2x4") or a full share link (e.g. "https://.../share/K7M9P2X4").
 * Returns null when the input does not look like a valid code.
 */
export function normalizeShareInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let candidate = trimmed;

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('/share/')) {
    try {
      const url = /^https?:\/\//i.test(trimmed)
        ? new URL(trimmed)
        : new URL(trimmed, 'http://placeholder.local');
      const match = url.pathname.match(/\/share\/([^/?#]+)/i);
      if (!match) return null;
      candidate = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }

  const cleaned = candidate.replace(/[\s-]+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{4,24}$/.test(cleaned)) return null;
  return cleaned;
}

export function formatSharePath(code: string): string {
  return `/share/${encodeURIComponent(code)}`;
}
