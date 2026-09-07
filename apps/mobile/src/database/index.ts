import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import Location from './models/Location';
import Route from './models/Route';
import RouteStop from './models/RouteStop';

const adapter = new SQLiteAdapter({
  schema,
  // (You might want to pass 'dbName' here. If you don't, a default name will be used.)
  // dbName: 'easydel',
  jsi: true, // Use JSI for faster SQLite execution
  onSetUpError: (error) => {
    console.error('Database setup failed', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Location, Route, RouteStop],
});
