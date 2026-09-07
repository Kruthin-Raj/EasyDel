import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { OSRMRoutingProvider } from '@delivery/routing';
import { RouteStatus } from '@delivery/database';

@Injectable()
export class RoutesService {
  private routingProvider: OSRMRoutingProvider;

  constructor(private prisma: PrismaService) {
    this.routingProvider = new OSRMRoutingProvider();
  }

  async createDraft(createRouteDto: CreateRouteDto, userId: string) {
    // 1. Create a Draft Route
    const route = await this.prisma.route.create({
      data: {
        name: createRouteDto.name,
        status: RouteStatus.DRAFT,
        createdById: userId,
      },
    });

    // 2. Fetch Locations
    const locations = await this.prisma.deliveryLocation.findMany({
      where: { id: { in: createRouteDto.locationIds } },
    });

    if (locations.length !== createRouteDto.locationIds.length) {
      throw new BadRequestException('Some locations were not found.');
    }

    // 3. Optional: Reorder stops via OSRM if there are enough stops and start/end are known
    let orderedLocations = locations;
    let distance = 0;
    let duration = 0;
    let geometry = null;

    if (createRouteDto.startLocationId && createRouteDto.endLocationId && locations.length > 0) {
      const startLoc = locations.find((l) => l.id === createRouteDto.startLocationId) || locations[0];
      const endLoc = locations.find((l) => l.id === createRouteDto.endLocationId) || locations[locations.length - 1];

      try {
        const result = await this.routingProvider.optimizeRoute(
          { lat: startLoc.latitude, lng: startLoc.longitude },
          { lat: endLoc.latitude, lng: endLoc.longitude },
          locations.map((l) => ({ id: l.id, lat: l.latitude, lng: l.longitude }))
        );

        // Sort based on OSRM optimization
        orderedLocations = result.optimizedStops.map((os) => locations[os.originalIndex]);
        distance = result.totalDistance;
        duration = result.estimatedDuration;
        geometry = JSON.stringify(result.geometry);
      } catch (err) {
        console.warn('Routing optimization failed, using original order', err);
      }
    }

    // 4. Create RouteVersion
    const version = await this.prisma.routeVersion.create({
      data: {
        routeId: route.id,
        versionNumber: 1,
        totalDistance: distance,
        estimatedDuration: duration,
        routeGeometry: geometry,
        startLocationName: orderedLocations[0]?.name,
        endLocationName: orderedLocations[orderedLocations.length - 1]?.name,
      },
    });

    // 5. Create RouteStops
    await this.prisma.routeStop.createMany({
      data: orderedLocations.map((loc, idx) => ({
        routeVersionId: version.id,
        deliveryLocationId: loc.id,
        sequence: idx + 1,
      })),
    });

    // 6. Audit Log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE_ROUTE',
        entityType: 'Route',
        entityId: route.id,
      },
    });

    return this.prisma.route.findUnique({
      where: { id: route.id },
      include: { versions: { include: { stops: true } } },
    });
  }

  findAll() {
    return this.prisma.route.findMany({
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
  }

  async findOne(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { stops: { include: { deliveryLocation: true } } },
        },
      },
    });
    if (!route) throw new NotFoundException('Route not found');
    return route;
  }
}
