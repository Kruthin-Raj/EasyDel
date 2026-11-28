import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'locations',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'address', type: 'string' },
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'share_code', type: 'string', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'next_visit_note', type: 'string', isOptional: true },
        { name: 'entrance_instructions', type: 'string', isOptional: true },
        { name: 'photo_url', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'local_sync_state', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'routes',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'share_code', type: 'string', isOptional: true },
        { name: 'version_id', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'assigned_driver_id', type: 'string', isOptional: true },
        { name: 'local_sync_state', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'route_stops',
      columns: [
        { name: 'route_id', type: 'string', isIndexed: true },
        { name: 'location_id', type: 'string', isIndexed: true },
        { name: 'sequence', type: 'number' },
        { name: 'delivery_status', type: 'string' },
        { name: 'items_summary', type: 'string', isOptional: true },
        { name: 'local_sync_state', type: 'string' },
      ],
    }),
  ],
});
