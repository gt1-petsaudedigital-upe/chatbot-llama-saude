import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { GroqService } from 'src/groq/groq.service';
import { MachineService } from 'src/machine/machine.service';

const mockGroqService = {
  askGroq: jest.fn().mockResolvedValue('Mocked IASYS response'),
};

const mockMachineService = {
  getOrCreateActor: jest.fn(),
  interpretMessage: jest.fn().mockResolvedValue(['Machine response']),
};

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: GroqService, useValue: mockGroqService },
        { provide: MachineService, useValue: mockMachineService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });


  describe('handleMessageAsGenAIChatbot', () => {
    it('should return a reply and history after user message', async () => {
      const sessionId = 'test-session-1';
      service.stateSystemAsGenAIChatbot(sessionId);

      const result = await service.handleMessageAsGenAIChatbot({
        sessionId,
        message: 'Hello',
      });

      expect(result.reply).toBe('Mocked IASYS response');
      expect(result.history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Hello' }),
          expect.objectContaining({
            role: 'assistant',
            content: 'Mocked IASYS response',
          }),
        ]),
      );
    });

    it('should return error message if Groq fails', async () => {
      mockGroqService.askGroq.mockRejectedValueOnce(new Error('Groq offline'));

      const sessionId = 'error-session';
      service.stateSystemAsGenAIChatbot(sessionId);

      const result = await service.handleMessageAsGenAIChatbot({
        sessionId,
        message: 'test',
      });

      expect(result.reply).toBe(
        'Desculpe, houve um erro ao processar sua mensagem.',
      );
    });

    it('should trim history to a maximum of 20 non-system messages', async () => {
      const sessionId = 'trim-session';
      service.stateSystemAsGenAIChatbot(sessionId);

      for (let i = 0; i < 25; i++) {
        await service.handleMessageAsGenAIChatbot({
          sessionId,
          message: `message ${i}`,
        });
      }

      const { history } = await service.handleMessageAsGenAIChatbot({
        sessionId,
        message: 'final message',
      });

      const nonSystemMessages = history.filter((m) => m.role !== 'system');
      expect(nonSystemMessages.length).toBeLessThanOrEqual(20);
    });
  });


  describe('handleMessage', () => {
    it('should create a new session if sessionId does not exist', async () => {
      const result = await service.handleMessage({
        sessionId: 'new-session',
        message: 'hi',
      });

      expect(result.replies).toEqual(['Machine response']);
      expect(mockMachineService.getOrCreateActor).toHaveBeenCalledWith(
        'new-session',
      );
    });

    it('should accumulate history correctly between messages', async () => {
      const sessionId = 'accumulated-session';

      await service.handleMessage({ sessionId, message: 'first' });
      const result = await service.handleMessage({
        sessionId,
        message: 'second',
      });

      const userMessages = result.history.filter((m) => m.role === 'user');
      expect(userMessages.length).toBe(2);
    });
  });


  describe('cleanExpiredSessions', () => {
    it('should remove sessions inactive beyond TTL', async () => {
      const sessionId = 'expired-session';
      service.stateSystemAsGenAIChatbot(sessionId);

      await service.handleMessageAsGenAIChatbot({
        sessionId,
        message: 'hi',
      });

      (service as any).conversations[sessionId].lastActivity =
        Date.now() - 31 * 60 * 1000;

      (service as any).cleanExpiredSessions();

      expect((service as any).conversations[sessionId]).toBeUndefined();
    });

    it('should keep sessions still within TTL', async () => {
      const sessionId = 'active-session';
      service.stateSystemAsGenAIChatbot(sessionId);

      await service.handleMessageAsGenAIChatbot({
        sessionId,
        message: 'hi',
      });

      (service as any).cleanExpiredSessions();

      expect((service as any).conversations[sessionId]).toBeDefined();
    });
  });
});