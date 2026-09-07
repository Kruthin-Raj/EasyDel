import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { LocationStatus } from '@delivery/database';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  async create(createLocationDto: CreateLocationDto, userId: string) {
    const location = await this.prisma.deliveryLocation.create({
      data: createLocationDto,
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        entityType: 'Location',
        entityId: location.id,
      },
    });

    return location;
  }

  findAll() {
    return this.prisma.deliveryLocation.findMany({
      where: { status: { not: LocationStatus.ARCHIVED } },
    });
  }

  async findOne(id: string) {
    const location = await this.prisma.deliveryLocation.findUnique({
      where: { id },
      include: { subscriptions: true },
    });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async setStatus(id: string, status: LocationStatus, userId: string, reason?: string) {
    const location = await this.findOne(id);
    const updated = await this.prisma.deliveryLocation.update({
      where: { id },
      data: { status },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: `SET_STATUS_${status}`,
        entityType: 'Location',
        entityId: location.id,
        reason,
      },
    });

    return updated;
  }
}
