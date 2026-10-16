import { Module } from '@nestjs/common';
import { SupabaseStrategy } from './supabase-strategy.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [PrismaModule, PassportModule.register({ defaultStrategy: 'supabase' })],
  providers: [SupabaseStrategy],
  exports: [PassportModule]
})
export class AuthModule {}
