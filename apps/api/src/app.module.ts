import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { RoutesModule } from './routes/routes.module.js';
import { TrackingModule } from './tracking/tracking.module.js';
import { SyncModule } from './sync/sync.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [AuthModule, UsersModule, LocationsModule, RoutesModule, TrackingModule, SyncModule, PrismaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
