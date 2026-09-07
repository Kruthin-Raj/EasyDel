import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseStrategyService } from './supabase-strategy.service.js';

describe('SupabaseStrategyService', () => {
  let service: SupabaseStrategyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupabaseStrategyService],
    }).compile();

    service = module.get<SupabaseStrategyService>(SupabaseStrategyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
