import { Injectable, Logger } from '@nestjs/common';
import { createChatflowMachine } from './machine.xstate';
import { GroqService } from 'src/groq/groq.service';
import { UserService } from 'src/user/user.service';
import { ActorRefFrom, createActor } from 'xstate';

type ChatflowActor = ActorRefFrom<ReturnType<typeof createChatflowMachine>>;

@Injectable()
export class MachineService {
  private actors: Record<string, ChatflowActor> = {};
  private logger: Logger = new Logger(MachineService.name);

  constructor(
    private readonly groqService: GroqService,
    private readonly userService: UserService,
  ) {}

  public async getOrCreateActor(sessionId: string): Promise<ChatflowActor> {
    if (!this.actors[sessionId]) {
      const machine = createChatflowMachine(this.groqService);
      const actor = createActor(machine).start();

      // Busca o usuário padrão no banco pelo CPF fixo
      const DEFAULT_CPF = process.env.DEFAULT_USER_CPF || '12345678901';
      const user = await this.userService.findByCpf(DEFAULT_CPF);

      if (user) {
        // Injeta os dados do usuário no contexto e vai direto para o menu
        actor.send({
          type: 'LOAD_USER',
          value: {
            name: user.name,
            cpf: user.cpf,
            birthDate: user.birthDate,
            socialName: user.socialName || '',
            hasSocialName: user.hasSocialName,
            sex: user.sex || '',
            hasHealthProfessionalName: user.hasHealthProfessionalName,
            healthProfessionalName: user.healthProfessionalName || '',
          },
        });
        this.logger.log(`User loaded from DB: ${user.name}`);
      }

      this.actors[sessionId] = actor;
      this.logger.log(`New machine created - session id: ${sessionId}`);
    }
    return this.actors[sessionId];
  }

  public async interpretMessage(
    sessionId: string,
    message: string,
  ): Promise<string[]> {
    this.logger.log('Starting machine message interpretation');
    const actor = await this.getOrCreateActor(sessionId);

    let snapshot = actor.getSnapshot();
    const lastStateValue = snapshot.value;

    const eventType = this.mapInputToEvent(message, lastStateValue as string);

    actor.send({ type: eventType as string, value: message });

    await this.sleep(1200);

    snapshot = actor.getSnapshot();

    this.logger.log('Obtaining messages from the machine');
    const responses = snapshot.context.responses || [];

    actor.send({ type: 'CLEAR_RESPONSES' });

    this.logger.log('Sending responses to the chatbot');
    return responses;
  }

  private normalize(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private mapInputToEvent(input: string, lastState: string): string | null {
    this.logger.log('Classifying the event type to send for the machine');
    const trimmed = input.trim().toLowerCase();
    const normalized = this.normalize(input);

    if (lastState === 'menu') {
      if (
        trimmed === '1' ||
        trimmed.includes('problema') ||
        trimmed.includes('saúde') ||
        normalized.includes('saude')
      ) {
        return 'HEALTH_ISSUE_INFORM';
      }
      if (
        trimmed === '2' ||
        trimmed.includes('agendar') ||
        trimmed.includes('consulta')
      ) {
        return 'SCHEDULE_APPOINTMENT';
      }
      if (
        trimmed === '3' ||
        trimmed.includes('orientações') ||
        normalized.includes('orientacoes') ||
        trimmed.includes('rápidas') ||
        normalized.includes('rapidas')
      ) {
        return 'QUICK_GUIDANCE';
      }
    }

    if (lastState === 'schedule_appointment_flow') {
      if (trimmed === '1' || trimmed.includes('agendar')) {
        return 'SCHEDULE';
      }
      if (trimmed === '2' || trimmed.includes('verificar')) {
        return 'VERIFY';
      }
    }

    if (lastState === 'quick_guidance_flow') {
      if (
        trimmed === '1' ||
        trimmed.includes('vacinação') ||
        normalized.includes('vacinacao')
      ) {
        return 'VACCINATION_FLOW';
      }
      if (
        trimmed === '2' ||
        trimmed.includes('medidas') ||
        trimmed.includes('higiene')
      ) {
        return 'HYGIENE_MEASURES_FLOW';
      }
      if (
        trimmed === '3' ||
        trimmed.includes('situações') ||
        normalized.includes('situacoes') ||
        trimmed.includes('urgência') ||
        normalized.includes('urgencia')
      ) {
        return 'URGENCY_SITUATION_FLOW';
      }
    }

    const YES_VARIANTS = ['sim', 's', 'si', 'yes', 'y', 'claro', 'quero', 'afirmativo', 'com certeza', 'pode ser'];
    const NO_VARIANTS = ['nao', 'n', 'no', 'negativo', 'nao quero'];

    if (YES_VARIANTS.includes(normalized) || YES_VARIANTS.some(v => normalized.startsWith(v))) {
      return 'YES';
    }
    if (NO_VARIANTS.includes(normalized) || NO_VARIANTS.some(v => normalized.startsWith(v))) {
      return 'NO';
    }

    if (normalized === 'ajuda') {
      return 'STILL_NEED_HELP';
    }

    if (lastState === 'check_user_or_other_person_vaccination') {
      if (trimmed === '2' || trimmed === 'pessoa' || trimmed === 'outra') {
        return 'OTHER_PERSON';
      }
      if (trimmed === '1' || trimmed === 'mim' || trimmed === 'eu') {
        return 'MYSELF';
      }
    }

    if (
      ![
        'HEALTH_ISSUE_INFORM',
        'SCHEDULE_APPOINTMENT',
        'QUICK_INFO',
        'YES',
        'NO',
        'STILL_NEED_HELP',
      ].includes(trimmed)
    ) {
      return 'USER_INPUT';
    }

    return trimmed;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}