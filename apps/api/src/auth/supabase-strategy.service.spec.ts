import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseStrategy } from './supabase-strategy.service.js';

describe('SupabaseStrategyService', () => {
  let service: SupabaseStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupabaseStrategy],
    }).compile();

    service = module.get<SupabaseStrategy>(SupabaseStrategy);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
