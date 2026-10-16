import { Controller, Get, Post, Query, Body, UseGuards, Req } from '@nestjs/common';
import { SyncService } from './sync.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('pull')
  pullChanges(@Query('lastPulledAt') lastPulledAt: string, @Req() req: any) {
    return this.syncService.pullChanges(parseInt(lastPulledAt, 10), req.user.id);
  }

  @Post('push')
  pushChanges(@Body() changes: any, @Query('lastPulledAt') lastPulledAt: string, @Req() req: any) {
    return this.syncService.pushChanges(changes, parseInt(lastPulledAt, 10), req.user.id);
  }
}
