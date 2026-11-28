import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Location extends Model {
  static table = 'locations';

  @text('remote_id') remoteId!: string;
  @text('name') name!: string;
  @text('address') address!: string;
  @field('latitude') latitude!: number;
  @field('longitude') longitude!: number;
  @text('share_code') shareCode!: string | null;
  @text('notes') notes!: string | null;
  @text('next_visit_note') nextVisitNote!: string | null;
  @text('entrance_instructions') entranceInstructions!: string | null;
  @text('photo_url') photoUrl!: string | null;
  @text('status') status!: string;
  @text('sync_status') syncStatus!: string;
}
