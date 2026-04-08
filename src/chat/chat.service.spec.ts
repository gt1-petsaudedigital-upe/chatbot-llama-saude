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
  let module: TestingModule;

  beforeEach(async () => {
    // Garante mocks limpos antes de cada teste
    jest.clearAllMocks();
    mockGroqService.askGroq.mockResolvedValue('Mocked IASYS response');
    mockMachineService.interpretMessage.mockResolvedValue(['Machine response']);

    module = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: GroqService, useValue: mockGroqService },
        { provide: MachineService, useValue: mockMachineService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);

    // Limpa o setInterval para não vazar entre testes
    clearInterval((service as any).cleanupInterval);
  });

  afterAll(async () => {
    await module.close();
  });

  // ---------------------------------------------------------------------------
  // handleMessageAsGenAIChatbot
  // ---------------------------------------------------------------------------
  describe('handleMessageAsGenAIChatbot', () => {
    it('deve retornar reply e histórico após mensagem do usuário', async () => {
      const sessionId = 'test-session-1';
      service.stateSystemAsGenAIChatbot(sessionId);

      const result = await service.handleMessageAsGenAIChatbot({
        sessionId,
        message: 'Olá',
      });

      expect(result.reply).toBe('Mocked IASYS response');
      expect(result.history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Olá' }),
          expect.objectContaining({
            role: 'assistant',
            content: 'Mocked IASYS response',
          }),
        ]),
      );
      expect(mockGroqService.askGroq).toHaveBeenCalledTimes(1);
    });

    it('deve retornar mensagem de erro quando o Groq falha', async () => {
      mockGroqService.askGroq.mockRejectedValueOnce(new Error('Groq offline'));

      const sessionId = 'error-session';
      service.stateSystemAsGenAIChatbot(sessionId);

      const result = await service.handleMessageAsGenAIChatbot({
        sessionId,
        message: 'teste',
      });

      expect(result.reply).toBe(
        'Desculpe, houve um erro ao processar sua mensagem.',
      );
    });

    it('deve acumular histórico corretamente entre chamadas', async () => {
      const sessionId = 'accumulate-gen-session';
      service.stateSystemAsGenAIChatbot(sessionId);

      await service.handleMessageAsGenAIChatbot({ sessionId, message: 'primeira' });
      const result = await service.handleMessageAsGenAIChatbot({
        sessionId,
        message: 'segunda',
      });

      const userMessages = result.history.filter((m) => m.role === 'user');
      const assistantMessages = result.history.filter(
        (m) => m.role === 'assistant',
      );

      expect(userMessages.length).toBe(2);
      expect(assistantMessages.length).toBe(2);
    });

    it('deve limitar mensagens não-system a no máximo 20 após trim', async () => {
      const sessionId = 'trim-session';
      service.stateSystemAsGenAIChatbot(sessionId);

      // 10 chamadas = 10 user + 10 assistant = 20 (no limite)
      for (let i = 0; i < 10; i++) {
        await service.handleMessageAsGenAIChatbot({
          sessionId,
          message: `mensagem ${i}`,
        });
      }

      // 11ª chamada gera 22 mensagens não-system → trim reduz para 20
      const { history } = await service.handleMessageAsGenAIChatbot({
        sessionId,
        message: 'mensagem extra',
      });

      const nonSystemMessages = history.filter((m) => m.role !== 'system');
      expect(nonSystemMessages.length).toBeLessThanOrEqual(20);
    });

    it('deve preservar sempre a mensagem de sistema no histórico após trim', async () => {
      const sessionId = 'trim-system-session';
      service.stateSystemAsGenAIChatbot(sessionId);

      for (let i = 0; i < 15; i++) {
        await service.handleMessageAsGenAIChatbot({
          sessionId,
          message: `msg ${i}`,
        });
      }

      const { history } = await service.handleMessageAsGenAIChatbot({
        sessionId,
        message: 'msg final',
      });

      const systemMessages = history.filter((m) => m.role === 'system');
      expect(systemMessages.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // handleMessage (via MachineService)
  // ---------------------------------------------------------------------------
  describe('handleMessage', () => {
    it('deve criar nova sessão e acionar getOrCreateActor quando sessionId não existe', async () => {
      const result = await service.handleMessage({
        sessionId: 'new-session',
        message: 'oi',
      });

      expect(result.replies).toEqual(['Machine response']);
      expect(mockMachineService.getOrCreateActor).toHaveBeenCalledWith(
        'new-session',
      );
      expect(mockMachineService.interpretMessage).toHaveBeenCalledWith(
        'new-session',
        'oi',
      );
    });

    it('não deve chamar getOrCreateActor novamente para sessão já existente', async () => {
      const sessionId = 'existing-session';

      await service.handleMessage({ sessionId, message: 'primeira' });
      await service.handleMessage({ sessionId, message: 'segunda' });

      // getOrCreateActor só deve ter sido chamado uma vez (na criação da sessão)
      expect(mockMachineService.getOrCreateActor).toHaveBeenCalledTimes(1);
    });

    it('deve acumular histórico corretamente entre mensagens', async () => {
      const sessionId = 'accumulated-session';

      await service.handleMessage({ sessionId, message: 'primeira' });
      const result = await service.handleMessage({
        sessionId,
        message: 'segunda',
      });

      const userMessages = result.history.filter((m) => m.role === 'user');
      expect(userMessages.length).toBe(2);
    });

    it('deve usar o prompt do agente correto quando agentId é fornecido', async () => {
      const sessionId = 'agent-session';

      await service.handleMessage({
        sessionId,
        message: 'oi',
        agentId: 1,
      });

      const systemMessage = (service as any).conversations[
        sessionId
      ].messages.find((m: any) => m.role === 'system');

      expect(systemMessage.content).toContain('saúde pública');
    });

    it('deve usar o prompt padrão (agentId 4) quando agentId inválido é fornecido', async () => {
      const sessionId = 'invalid-agent-session';

      await service.handleMessage({
        sessionId,
        message: 'oi',
        agentId: 99,
      });

      const systemMessage = (service as any).conversations[
        sessionId
      ].messages.find((m: any) => m.role === 'system');

      expect(systemMessage.content).toContain('uso geral');
    });

    it('deve gerar um sessionId via uuid quando não é fornecido', async () => {
      const result = await service.handleMessage({ message: 'oi sem sessão' });

      expect(result.history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: 'oi sem sessão',
          }),
        ]),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // cleanExpiredSessions
  // ---------------------------------------------------------------------------
  describe('cleanExpiredSessions', () => {
    it('deve remover sessões inativas além do TTL', async () => {
      const sessionId = 'expired-session';
      service.stateSystemAsGenAIChatbot(sessionId);

      await service.handleMessageAsGenAIChatbot({ sessionId, message: 'oi' });

      // Simula sessão expirada (31 minutos atrás)
      (service as any).conversations[sessionId].lastActivity =
        Date.now() - 31 * 60 * 1000;

      (service as any).cleanExpiredSessions();

      expect((service as any).conversations[sessionId]).toBeUndefined();
    });

    it('deve manter sessões ainda dentro do TTL', async () => {
      const sessionId = 'active-session';
      service.stateSystemAsGenAIChatbot(sessionId);

      await service.handleMessageAsGenAIChatbot({ sessionId, message: 'oi' });

      (service as any).cleanExpiredSessions();

      expect((service as any).conversations[sessionId]).toBeDefined();
    });

    it('deve remover apenas sessões expiradas e manter as ativas', async () => {
      const expiredId = 'expired-multi';
      const activeId = 'active-multi';

      service.stateSystemAsGenAIChatbot(expiredId);
      service.stateSystemAsGenAIChatbot(activeId);

      await service.handleMessageAsGenAIChatbot({
        sessionId: expiredId,
        message: 'oi',
      });
      await service.handleMessageAsGenAIChatbot({
        sessionId: activeId,
        message: 'oi',
      });

      (service as any).conversations[expiredId].lastActivity =
        Date.now() - 31 * 60 * 1000;

      (service as any).cleanExpiredSessions();

      expect((service as any).conversations[expiredId]).toBeUndefined();
      expect((service as any).conversations[activeId]).toBeDefined();
    });
  });
});