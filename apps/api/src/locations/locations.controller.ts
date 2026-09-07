import { Controller, Get, Post, Body, Patch, Param, UseGuards, Req } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role, LocationStatus } from '@delivery/database';

@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MENTOR)
  create(@Body() createLocationDto: CreateLocationDto, @Req() req) {
    return this.locationsService.create(createLocationDto, req.user.id);
  }

  @Get()
  findAll() {
    return this.locationsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.locationsService.findOne(id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  setStatus(
    @Param('id') id: string,
    @Body('status') status: LocationStatus,
    @Body('reason') reason: string,
    @Req() req,
  ) {
    return this.locationsService.setStatus(id, status, req.user.id, reason);
  }
}
