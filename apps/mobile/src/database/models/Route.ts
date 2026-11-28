import { Model } from '@nozbe/watermelondb';
import { text } from '@nozbe/watermelondb/decorators';

export default class Route extends Model {
  static table = 'routes';

  @text('remote_id') remoteId!: string;
  @text('name') name!: string;
  @text('share_code') shareCode!: string | null;
  @text('version_id') versionId!: string | null;
  @text('status') status!: string;
  @text('assigned_driver_id') assignedDriverId!: string | null;
  @text('local_sync_state') localSyncState!: string;
}
