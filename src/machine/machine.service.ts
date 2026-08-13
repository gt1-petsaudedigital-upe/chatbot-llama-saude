import { Injectable, Logger } from '@nestjs/common';
import { createChatflowMachine } from './machine.xstate';
import { GroqService } from 'src/groq/groq.service';
import { UserService } from 'src/user/user.service';
import { ActorRefFrom, createActor } from 'xstate';

type ChatflowActor = ActorRefFrom<ReturnType<typeof createChatflowMachine>>;

@Injectable()
export class MachineService {
  private actors: Record<string, ChatflowActor> = {};
  private pending: Record<string, Promise<ChatflowActor>> = {};
  private logger: Logger = new Logger(MachineService.name);

  constructor(
    private readonly groqService: GroqService,
    private readonly userService: UserService,
  ) {}

  public async getOrCreateActor(sessionId: string): Promise<ChatflowActor> {
    if (this.actors[sessionId]) return this.actors[sessionId];
    if (sessionId in this.pending) return this.pending[sessionId];

    this.pending[sessionId] = (async () => {
      const machine = createChatflowMachine(this.groqService);
      const actor = createActor(machine).start();
      const DEFAULT_CPF = process.env.DEFAULT_USER_CPF || '12345678901';
      const user = await this.userService.findByCpf(DEFAULT_CPF);
      if (user) {
        actor.send({
          type: 'LOAD_USER',
          value: {
            name: user.name, cpf: user.cpf, birthDate: user.birthDate,
            socialName: user.socialName || '', hasSocialName: user.hasSocialName,
            sex: user.sex || '', hasHealthProfessionalName: user.hasHealthProfessionalName,
            healthProfessionalName: user.healthProfessionalName || '',
          },
        });
        this.logger.log(`User loaded from DB: ${user.name}`);
      }
      this.actors[sessionId] = actor;
      delete this.pending[sessionId];
      this.logger.log(`New machine created - session id: ${sessionId}`);
      return actor;
    })();

    return this.pending[sessionId];
  }

  public async interpretMessage(sessionId: string, message: string): Promise<string[]> {
    this.logger.log('Starting machine message interpretation');
    const actor = await this.getOrCreateActor(sessionId);
    const snapshot = actor.getSnapshot();
    const lastStateValue = snapshot.value;
    const eventType = this.mapInputToEvent(message, lastStateValue as string);
    actor.send({ type: eventType as string, value: message });
    await this.sleep(1200);
    const updatedSnapshot = actor.getSnapshot();
    const responses = updatedSnapshot.context.responses || [];
    actor.send({ type: 'CLEAR_RESPONSES' });
    this.logger.log('Sending responses to the chatbot');
    return responses;
  }

  private normalize(input: string): string {
    return input.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private mapInputToEvent(input: string, lastState: string): string {
    this.logger.log('Classifying the event type to send for the machine');
    const trimmed = input.trim().toLowerCase();
    const normalized = this.normalize(input);

    if (lastState === 'menu') {
      if (trimmed === '1' || normalized.includes('orientacao') || normalized.includes('rapida'))
        return 'QUICK_GUIDANCE';
      if (trimmed === '2' || normalized.includes('encaminhamento') || normalized.includes('onde procurar') || normalized.includes('atendimento'))
        return 'ENCAMINHAMENTO';
      if (trimmed === '3' || normalized.includes('vacinacao') || normalized.includes('vacina'))
        return 'VACINACAO';
      if (trimmed === '4' || normalized.includes('farmacia'))
        return 'FARMACIA';
      if (trimmed === '5' || normalized.includes('agendar') || normalized.includes('consulta'))
        return 'SCHEDULE_APPOINTMENT';
    }

    if (lastState === 'encaminhamento_flow' || lastState === 'encaminhamento_leve_moderado' ||
        lastState === 'encaminhamento_crianca_gestante') {
      if (['sim', 's', 'yes', 'y', 'claro', 'quero', 'afirmativo'].includes(normalized) || normalized.startsWith('sim'))
        return 'YES';
      if (['nao', 'n', 'no', 'negativo'].includes(normalized) || normalized.startsWith('nao'))
        return 'NO';
    }

    if (lastState === 'schedule_appointment_flow') {
      if (trimmed === '1' || normalized.includes('agendar')) return 'SCHEDULE';
      if (trimmed === '2' || normalized.includes('datas') || normalized.includes('funcionamento')) return 'DATAS_SERVICO';
      if (trimmed === '3' || normalized.includes('verificar') || normalized.includes('ver')) return 'VERIFY';
    }

    if (lastState === 'datas_servico_flow') {
      if (trimmed === '1' || normalized.includes('medico')) return 'SERVICO_MEDICO';
      if (trimmed === '2' || normalized.includes('enfermagem')) return 'SERVICO_ENFERMAGEM';
      if (trimmed === '3' || normalized.includes('fisioterapia')) return 'SERVICO_FISIOTERAPIA';
      if (trimmed === '4' || normalized.includes('odontologia') || normalized.includes('dente')) return 'SERVICO_ODONTOLOGIA';
      if (trimmed === '5' || normalized.includes('psicologia')) return 'SERVICO_PSICOLOGIA';
      if (trimmed === '6' || normalized.includes('nutricao')) return 'SERVICO_NUTRICAO';
    }

    if (lastState === 'quick_guidance_flow') {
      if (trimmed === '1' || normalized.includes('nutricao')) return 'NUTRICAO';
      if (trimmed === '2' || normalized.includes('fisioterapia')) return 'FISIOTERAPIA';
      if (trimmed === '3' || normalized.includes('enfermagem')) return 'ENFERMAGEM';
      if (trimmed === '4' || normalized.includes('psicologia')) return 'PSICOLOGIA';
      if (trimmed === '5' || normalized.includes('atividade') || normalized.includes('fisica')) return 'ATIVIDADE_FISICA';
      if (trimmed === '6' || normalized.includes('doacao') || normalized.includes('sangue')) return 'DOACAO_SANGUE';
    }

    if (lastState === 'quick_guidance_nutricao') {
      if (trimmed === '1' || normalized.includes('alimentacao') || normalized.includes('comida')) return 'ALIMENTACAO_BASICA';
      if (trimmed === '2' || normalized.includes('hidratacao') || normalized.includes('agua')) return 'HIDRATACAO';
    }

    if (lastState === 'quick_guidance_fisioterapia') {
      if (trimmed === '1' || normalized.includes('postura') || normalized.includes('coluna')) return 'POSTURA';
      if (trimmed === '2' || normalized.includes('queda') || normalized.includes('prevencao')) return 'PREVENCAO_QUEDAS';
      if (trimmed === '3' || normalized.includes('gelo') || normalized.includes('calor')) return 'GELO_OU_CALOR';
    }

    if (lastState === 'quick_guidance_enfermagem') {
      if (trimmed === '1' || normalized.includes('ferida') || normalized.includes('curativo')) return 'CUIDADOS_FERIDAS';
      if (trimmed === '2' || normalized.includes('febre')) return 'FEBRE';
    }

    if (lastState === 'quick_guidance_psicologia') {
      if (trimmed === '1' || normalized.includes('ansiedade') || normalized.includes('stress')) return 'ANSIEDADE_STRESS';
      if (trimmed === '2' || normalized.includes('rede') || normalized.includes('apoio') || normalized.includes('cvv')) return 'REDE_APOIO';
      if (trimmed === '3' || normalized.includes('sono') || normalized.includes('dormir')) return 'HIGIENE_SONO';
    }

    if (lastState === 'quick_guidance_atividade_fisica') {
      if (trimmed === '1' || normalized.includes('ate 5') || normalized.includes('bebe')) return 'CRIANCA_ATE_5';
      if (trimmed === '2' || normalized.includes('adolescente') || normalized.includes('crianca')) return 'CRIANCA_ATE_17';
      if (trimmed === '3' || normalized.includes('adulto')) return 'ADULTO';
      if (trimmed === '4' || normalized.includes('idoso') || normalized.includes('terceira idade')) return 'IDOSO';
    }

    if (lastState === 'quick_guidance_doacao_sangue') {
      if (trimmed === '1' || normalized.includes('quem')) return 'QUEM_PODE_DOAR';
      if (trimmed === '2' || normalized.includes('onde')) return 'ONDE_DOAR';
      if (trimmed === '3' || normalized.includes('como') || normalized.includes('funciona')) return 'COMO_FUNCIONA';
      if (trimmed === '4' || normalized.includes('cuidado') || normalized.includes('antes')) return 'CUIDADOS_ANTES';
      if (trimmed === '5' || normalized.includes('impedimento')) return 'IMPEDIMENTOS';
    }

    if (lastState === 'quick_guidance_doacao_retorno') {
      if (trimmed === '1' || normalized.includes('doacao')) return 'VOLTAR_DOACAO';
      if (trimmed === '2' || normalized.includes('orientacao')) return 'VOLTAR_ORIENTACOES';
      if (trimmed === '3' || normalized.includes('encerrar')) return 'ENCERRAR';
    }

    if (lastState === 'farmacia_flow') {
      if (trimmed === '1' || normalized.includes('horario') || normalized.includes('funcionamento')) return 'FARMACIA_HORARIO';
      if (trimmed === '2' || normalized.includes('endereco') || normalized.includes('localizacao')) return 'FARMACIA_ENDERECO';
      if (trimmed === '3' || normalized.includes('medicamento') || normalized.includes('remedio')) return 'FARMACIA_MEDICAMENTOS';
      if (trimmed === '4' || normalized.includes('orientacao')) return 'FARMACIA_ORIENTACOES';
    }

    if (lastState === 'farmacia_retorno') {
      if (trimmed === '1' || normalized.includes('farmacia')) return 'VOLTAR_FARMACIA';
      if (trimmed === '2' || normalized.includes('principal') || normalized.includes('menu')) return 'VOLTAR_MENU';
      if (trimmed === '3' || normalized.includes('encerrar')) return 'ENCERRAR';
    }

    if (lastState === 'vacinacao_flow') {
      if (trimmed === '1' || normalized.includes('quais vacinas') || normalized.includes('tomar')) return 'VAC_QUAIS_VACINAS';
      if (trimmed === '2' || normalized.includes('ubs') || normalized.includes('disponivel')) return 'VAC_QUAL_UBS';
      if (trimmed === '3' || normalized.includes('documento')) return 'VAC_DOCUMENTOS';
      if (trimmed === '4' || normalized.includes('horario') || normalized.includes('sala')) return 'VAC_HORARIO';
      if (trimmed === '5' || normalized.includes('grupo') || normalized.includes('especial')) return 'VAC_GRUPOS';
    }

    if (lastState === 'vacinacao_para_quem') {
      if (normalized.includes('crianca') || normalized.includes('bebe')) return 'VAC_CRIANCA';
      if (normalized.includes('adolescente')) return 'VAC_ADOLESCENTE';
      if (normalized.includes('adulto')) return 'VAC_ADULTO';
      if (normalized.includes('idoso') || normalized.includes('idosa')) return 'VAC_IDOSO';
      if (normalized.includes('gestante') || normalized.includes('gravida') || normalized.includes('gravidez')) return 'VAC_GESTANTE';
    }

    if (lastState === 'vacinacao_adulto_tipo') {
      if (trimmed === '1' || normalized.includes('rotina')) return 'VAC_ROTINA';
      if (trimmed === '2' || normalized.includes('atrasada') || normalized.includes('atraso')) return 'VAC_ATRASADA';
    }

    if (lastState === 'vacinacao_idoso_tipo') {
      if (trimmed === '1' || normalized.includes('rotina')) return 'VAC_ROTINA';
      if (trimmed === '2' || normalized.includes('campanha')) return 'VAC_CAMPANHA';
    }

    if (lastState === 'vacinacao_idoso_campanha') {
      if (trimmed === '1' || normalized.includes('gripe') || normalized.includes('influenza')) return 'VAC_GRIPE';
      if (trimmed === '2' || normalized.includes('covid')) return 'VAC_COVID';
      if (trimmed === '3' || normalized.includes('outras') || normalized.includes('outra')) return 'VAC_OUTRAS';
    }

    if (['vacinacao_idoso_gripe_ubs', 'vacinacao_ubs_resultado', 'vacinacao_ubs_lista', 'vacinacao_idoso_campanha_resultado'].includes(lastState)) {
      if (trimmed === '1' || normalized.includes('horario')) return 'VAC_HORARIO_UBS';
      if (trimmed === '2' || normalized.includes('documento')) return 'VAC_DOCS_UBS';
      if (trimmed === '3' || normalized.includes('outra')) return 'VAC_OUTRA_UBS';
      if (normalized.includes('outras vacinas') || normalized.includes('outras campanhas')) return 'VAC_OUTRAS_VACS';
    }

    if (lastState === 'vacinacao_ubs_inicio') {
      if (trimmed === '1' || normalized.includes('especifica') || normalized.includes('especifico')) return 'VAC_ESPECIFICA';
      if (trimmed === '2' || normalized.includes('proxima') || normalized.includes('bairro')) return 'VAC_MAIS_PROXIMA';
    }

    const YES_VARIANTS = ['sim', 's', 'si', 'yes', 'y', 'claro', 'quero', 'afirmativo', 'com certeza', 'pode ser'];
    const NO_VARIANTS  = ['nao', 'n', 'no', 'negativo', 'nao quero'];

    if (YES_VARIANTS.includes(normalized) || YES_VARIANTS.some((v) => normalized.startsWith(v)))
      return 'YES';
    if (NO_VARIANTS.includes(normalized) || NO_VARIANTS.some((v) => normalized.startsWith(v)))
      return 'NO';

    return 'USER_INPUT';
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}