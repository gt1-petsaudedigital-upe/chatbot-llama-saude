import { Test, TestingModule } from '@nestjs/testing';
import { GroqService } from './groq.service';
import { ConfigModule } from '@nestjs/config';
import { beforeEach, describe, it } from 'node:test';

describe('GroqService', () => {
  let service: GroqService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()], // ← estava faltando isso
      providers: [GroqService],
    }).compile();

    service = module.get<GroqService>(GroqService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});