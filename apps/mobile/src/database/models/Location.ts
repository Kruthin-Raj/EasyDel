import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Location extends Model {
  static table = 'locations';

  @text('name') name!: string;
  @text('address') address!: string;
  @field('latitude') latitude!: number;
  @field('longitude') longitude!: number;
  @text('status') status!: string;
  @text('sync_status') syncStatus!: string;
}
