import { Module } from '@nestjs/common';
import { SupabaseStrategyService } from './supabase-strategy.service.js';

@Module({
  providers: [SupabaseStrategyService]
})
export class AuthModule {}
