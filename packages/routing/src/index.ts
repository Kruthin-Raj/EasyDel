import axios from 'axios';

export interface RouteGeometry {
  type: string;
  coordinates: number[][];
}

export interface RouteOptimizationResult {
  optimizedStops: { originalIndex: number; newIndex: number }[];
  totalDistance: number;
  estimatedDuration: number;
  geometry: RouteGeometry;
}

export interface RoutingProvider {
  optimizeRoute(
    startLocation: { lat: number; lng: number },
    endLocation: { lat: number; lng: number },
    stops: { id: string; lat: number; lng: number }[],
  ): Promise<RouteOptimizationResult>;
}

export class OSRMRoutingProvider implements RoutingProvider {
  constructor(private baseUrl: string = process.env.OSRM_URL || 'http://router.project-osrm.org') {}

  async optimizeRoute(
    startLocation: { lat: number; lng: number },
    endLocation: { lat: number; lng: number },
    stops: { id: string; lat: number; lng: number }[],
  ): Promise<RouteOptimizationResult> {
    const coordinates = [
      `${startLocation.lng},${startLocation.lat}`,
      ...stops.map((s) => `${s.lng},${s.lat}`),
      `${endLocation.lng},${endLocation.lat}`,
    ].join(';');

    const response = await axios.get(
      `${this.baseUrl}/trip/v1/driving/${coordinates}?source=first&destination=last&roundtrip=false&geometries=geojson`
    );

    const trip = response.data.trips[0];
    const waypoints = response.data.waypoints;

    // Remove start and end waypoints
    const stopWaypoints = waypoints.filter((w: any) => w.waypoint_index !== 0 && w.waypoint_index !== waypoints.length - 1);
    
    // Calculate new indexes for stops
    const optimizedStops = stopWaypoints.map((w: any, idx: number) => ({
      originalIndex: idx, // since they are returned in requested order, but waypoint_index tells us the optimized order
      newIndex: w.waypoint_index - 1, // shift back because 0 is start
    }));

    return {
      optimizedStops: optimizedStops.sort((a, b) => a.newIndex - b.newIndex),
      totalDistance: trip.distance,
      estimatedDuration: trip.duration,
      geometry: trip.geometry,
    };
  }
}
