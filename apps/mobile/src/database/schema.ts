import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'locations',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'address', type: 'string' },
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'status', type: 'string' },
        { name: 'sync_status', type: 'string' }, // 'synced', 'created', 'updated', 'deleted'
      ],
    }),
    tableSchema({
      name: 'routes',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'assigned_driver_id', type: 'string', isOptional: true },
        { name: 'sync_status', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'route_stops',
      columns: [
        { name: 'route_id', type: 'string', isIndexed: true },
        { name: 'location_id', type: 'string', isIndexed: true },
        { name: 'sequence', type: 'number' },
        { name: 'delivery_status', type: 'string' }, // 'PENDING', 'COMPLETED', 'SKIPPED'
        { name: 'sync_status', type: 'string' },
      ],
    }),
  ],
});
