import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class RouteStop extends Model {
  static table = 'route_stops';

  @text('route_id') routeId!: string;
  @text('location_id') locationId!: string;
  @field('sequence') sequence!: number;
  @text('delivery_status') deliveryStatus!: string;
  @text('items_summary') itemsSummary!: string | null;
  @text('local_sync_state') localSyncState!: string;
}
