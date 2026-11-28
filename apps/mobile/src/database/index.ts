import type { Database } from '@nozbe/watermelondb';

/**
 * Web/TypeScript fallback for `getDatabase()`.
 * Metro automatically resolves `./index.native.ts` for Android & iOS builds,
 * avoiding `better-sqlite3` node imports when previewing via `expo start --web`.
 */
export function getDatabase(): Database | null {
  return null;
}
