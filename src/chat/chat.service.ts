import { Injectable } from '@nestjs/common';
import { SendMessageDTO } from './dto/send-message.dto';
import { GroqService } from 'src/groq/groq.service';
import { ChatMessage } from './chat.types';
import { v4 as uuidv4 } from 'uuid';
import { MachineService } from 'src/machine/machine.service';

const MAX_MESSAGES_PER_SESSION = 20; 
const SESSION_TTL_MS = 30 * 60 * 1000; 

interface ConversationSession {
  messages: ChatMessage[];
  lastActivity: number; 
}

@Injectable()
export class ChatService {
  private conversations: Record<string, ConversationSession> = {};
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly groqService: GroqService,
    private readonly machineService: MachineService,
  ) {
    
    this.cleanupInterval = setInterval(
      () => this.cleanExpiredSessions(),
      10 * 60 * 1000,
    );
  }

  private cleanExpiredSessions(): void {
    const now = Date.now();
    for (const sessionId in this.conversations) {
      const session = this.conversations[sessionId];
      if (now - session.lastActivity > SESSION_TTL_MS) {
        delete this.conversations[sessionId];
        console.log(`Session expired and removed: ${sessionId}`);
      }
    }
  }

  private trimHistory(messages: ChatMessage[]): ChatMessage[] {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    if (nonSystemMessages.length > MAX_MESSAGES_PER_SESSION) {
      const trimmed = nonSystemMessages.slice(-MAX_MESSAGES_PER_SESSION);
      return [...systemMessages, ...trimmed];
    }

    return messages;
  }

  private createConversationHistory(sessionId: string) {
    if (!this.conversations[sessionId]) {
      this.conversations[sessionId] = {
        messages: [],
        lastActivity: Date.now(),
      };
      this.machineService.getOrCreateActor(sessionId);
    }
  }

  async handleMessage(dto: SendMessageDTO): Promise<{
    replies: string[];
    history: ChatMessage[];
  }> {
    const sessionId = dto.sessionId || uuidv4();
    this.createConversationHistory(sessionId);

    const session = this.conversations[sessionId];
    session.lastActivity = Date.now();
    session.messages.push({ role: 'user', content: dto.message });

    const responses = await this.machineService.interpretMessage(
      sessionId,
      dto.message,
    );

    responses.forEach((res) => {
      session.messages.push({ role: 'assistant', content: res });
    });

    session.messages = this.trimHistory(session.messages);

    return { replies: responses, history: session.messages };
  }

  stateSystemAsGenAIChatbot(sessionId: string): void {
    if (!this.conversations[sessionId]) {
      this.conversations[sessionId] = {
        messages: [
          {
            role: 'system',
            content: `Seu nome é IASYS. Você deve falar em Português.
              Você é um assistente prestativo, que está participando do projeto PET Saúde Digital, cujo objetivo é assistir à Saúde Pública em Petrolina. 
              Seja humilde e carismático ao falar, mas não se gabe disso.`,
          },
        ],
        lastActivity: Date.now(),
      };
    }
  }

  async handleMessageAsGenAIChatbot(
    dto: SendMessageDTO,
  ): Promise<{ reply: string; history: ChatMessage[] }> {
    const sessionId = dto.sessionId || uuidv4();

    const session = this.conversations[sessionId];
    session.lastActivity = Date.now();
    session.messages.push({ role: 'user', content: dto.message });

    let response: string;
    try {
      response = await this.groqService.askGroq(session.messages);
    } catch (error) {
      response = 'Desculpe, houve um erro ao processar sua mensagem.';
    }

    session.messages.push({ role: 'assistant', content: response });

    session.messages = this.trimHistory(session.messages);

    return { reply: response, history: session.messages };
  }
}