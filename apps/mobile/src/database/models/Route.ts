import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Route extends Model {
  static table = 'routes';

  @text('name') name!: string;
  @text('status') status!: string;
  @text('assigned_driver_id') assignedDriverId!: string | null;
  @text('sync_status') syncStatus!: string;
}
