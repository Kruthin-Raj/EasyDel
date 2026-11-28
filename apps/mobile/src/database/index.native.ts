import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import Location from './models/Location';
import Route from './models/Route';
import RouteStop from './models/RouteStop';

let dbInstance: Database | null = null;

/**
 * Native SQLite WatermelonDB initializer for Android / iOS APK builds.
 */
export function getDatabase(): Database | null {
  if (dbInstance) return dbInstance;

  try {
    const adapter = new SQLiteAdapter({
      schema,
      jsi: true,
      onSetUpError: (error) => {
        console.warn('SQLite setup error, falling back to memory cache', error);
      },
    });

    dbInstance = new Database({
      adapter,
      modelClasses: [Location, Route, RouteStop],
    });
    return dbInstance;
  } catch (error) {
    console.warn('WatermelonDB SQLite adapter unavailable in this runtime', error);
    return null;
  }
}
