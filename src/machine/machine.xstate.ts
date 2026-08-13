import { assign, createMachine, fromPromise, StateMachine } from 'xstate';
import { ChatMessage } from '../chat/chat.types';
import { GroqService } from 'src/groq/groq.service';
import { Logger } from '@nestjs/common';

const logger = new Logger(StateMachine.name);

const DATAS_SERVICOS: Record<string, string> = {
  medico:       'Segunda e Quarta: 07h30 às 11h30 | Sexta: 07h30 às 10h30',
  enfermagem:   'Segunda a Sexta: 07h00 às 12h00',
  fisioterapia: 'Terça e Quinta: 08h00 às 12h00 | 13h00 às 17h00',
  odontologia:  'Segunda, Quarta e Sexta: 07h30 às 11h30',
  psicologia:   'Terça e Quinta: 08h00 às 12h00',
  nutricao:     'Segunda e Quarta: 13h00 às 17h00',
};

const UBS_PETROLINA = [
  '🏥 UBS Antônio Cassimiro – Av. Cardoso de Sá, s/n – Bairro Jardim Aeroporto',
  '🏥 UBS José de Anchieta – R. Cel. Amorim, s/n – Bairro Vila Eduardo',
  '🏥 UBS Domingos Barbosa – R. José Pereira, s/n – Bairro Cohab',
  '🏥 UBS Maria Auxiliadora – R. São João, s/n – Bairro Areia Branca',
  '🏥 UBS Afrânio Moura – Av. Cardeal, s/n – Bairro São Gonçalo',
];

const UBS_POR_BAIRRO: Record<string, string> = {
  'jardim aeroporto': '🏥 UBS Antônio Cassimiro – Av. Cardoso de Sá, s/n – Bairro Jardim Aeroporto\n📞 (87) 3866-0000',
  'vila eduardo':     '🏥 UBS José de Anchieta – R. Cel. Amorim, s/n – Bairro Vila Eduardo\n📞 (87) 3866-1111',
  'cohab':            '🏥 UBS Domingos Barbosa – R. José Pereira, s/n – Bairro Cohab\n📞 (87) 3866-2222',
  'areia branca':     '🏥 UBS Maria Auxiliadora – R. São João, s/n – Bairro Areia Branca\n📞 (87) 3866-3333',
  'sao goncalo':      '🏥 UBS Afrânio Moura – Av. Cardeal, s/n – Bairro São Gonçalo\n📞 (87) 3866-4444',
  'cosme damiao':     '🏥 UBS Cosme Damião – R. Principal, s/n – Bairro Cosme Damião\n📞 (87) 3866-5555',
  'jose e maria':     '🏥 UBS José e Maria – Av. Central, s/n – Bairro José e Maria\n📞 (87) 3866-6666',
};

export const createChatflowMachine = (groqService: GroqService) =>
  createMachine(
    {
      id: 'chatflow',
      initial: 'start',
      context: {
        userInput: '',
        response: '',
        responses: [] as string[],
        nextState: undefined,
        typeOfAppointment: undefined,
        scheduledDateOptions: undefined,
        chosenDate: undefined,
        userInformation: {
          name: '',
          birthDate: '',
          hasSocialName: false,
          socialName: '',
          cpf: '',
          sex: '',
          hasHealthProfessionalName: false,
          healthProfessionalName: '',
          address: { neighborhood: '', street: '', number: '', complement: '' },
        },
      },
      on: {
        CLEAR_RESPONSES: { actions: [assign({ responses: [] })] },
      },
      states: {
        start: { always: { target: 'load_user' } },

        load_user: {
          on: {
            LOAD_USER: {
              target: 'menu',
              actions: assign(({ event }) => ({
                userInformation: {
                  name: event.value.name,
                  cpf: event.value.cpf,
                  birthDate: event.value.birthDate,
                  socialName: event.value.socialName || '',
                  hasSocialName: event.value.hasSocialName,
                  sex: event.value.sex || '',
                  hasHealthProfessionalName: event.value.hasHealthProfessionalName,
                  healthProfessionalName: event.value.healthProfessionalName || '',
                  address: { neighborhood: '', street: '', number: '', complement: '' },
                },
                responses: [`Olá, **${event.value.name}**! Seus dados foram carregados com sucesso.`],
              })),
            },
          },
        },
        menu: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Bem-vindo ao menu de serviços!',
              'Você gostaria de:\n1) Orientações rápidas\n2) Fluxo de encaminhamento (Onde procurar atendimento)\n3) Vacinação\n4) Farmácia\n5) Agendar ou confirmar uma consulta ou procedimento',
            ],
          })),
          on: {
            QUICK_GUIDANCE:       'quick_guidance_flow',
            ENCAMINHAMENTO:       'encaminhamento_flow',
            VACINACAO:            'vacinacao_flow',
            FARMACIA:             'farmacia_flow',
            SCHEDULE_APPOINTMENT: 'schedule_appointment_flow',
          },
        },
        encaminhamento_flow: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🚨 Vou te fazer algumas perguntas rápidas. Responda **SIM** caso sinta qualquer uma destas ou **NÃO** caso nenhuma se aplique, por favor.\n\n' +
              '- Dor muito forte no peito? É uma crise hipertensiva?\n' +
              '- Está com muita dificuldade para respirar ou sem ar?\n' +
              '- É um acidente grave ou com produtos perigosos?\n' +
              '- Queimadura extensa?\n' +
              '- Choque elétrico? Afogamento?\n' +
              '- Há um sangramento intenso que não para?\n' +
              '- É uma queda? Teve fratura? Bateu a cabeça? A vítima está inconsciente?\n' +
              '- Fraqueza súbita em uma parte do corpo, fala embolada ou perda de força nos braços ou nas pernas?\n' +
              '- Está sonolento ou confuso?',
            ],
          })),
          on: {
            YES: 'encaminhamento_emergencia',
            NO:  'encaminhamento_leve_moderado',
          },
        },
        encaminhamento_emergencia: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🚨 **Ligue para o 192 (SAMU) ou peça ajuda imediatamente.**',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        encaminhamento_leve_moderado: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Certo! Você apresenta sintomas leves a moderados?\n\n**Os sintomas leves a moderados** são aqueles que causam desconforto, mas **não colocam sua vida em risco imediato**. É o seu caso?',
            ],
          })),
          on: {
            YES: 'encaminhamento_crianca_gestante',
            NO:  'encaminhamento_ubs',
          },
        },
        encaminhamento_crianca_gestante: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'É uma criança ou gestante?'],
          })),
          on: {
            YES: 'encaminhamento_hospital',
            NO:  'encaminhamento_upa',
          },
        },
        encaminhamento_hospital: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🏥 Nesse caso, sugiro que você procure atendimento no **Hospital Dom Malan**.\n\nCaso tenha sido um acidente ou trauma, procure o **Hospital de Traumas (HU - UNIVASF)**.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        encaminhamento_upa: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🏥 Sugiro que você se dirija a uma **Unidade de Pronto Atendimento (UPA)** mais próxima ou a **Unidade Básica de Saúde** mais próxima de você.\n\nCaso tenha sido um acidente ou trauma, sugiro que você vá para o **Hospital de Traumas (HU - UNIVASF)**.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        encaminhamento_ubs: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🏥 Recomendo que você marque uma consulta na **Unidade Básica de Saúde** mais próxima de você.\n\nBusque a Unidade de Saúde para agendar sua consulta.',
            ],
          })),
          always: { target: 'still_need_help' },
        },

        quick_guidance_flow: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '⚠️ Atenção: Estas informações são apenas para orientação básica e não substituem uma avaliação profissional.',
              'Sobre qual área você gostaria de receber orientações?\n\n1) Nutrição\n2) Fisioterapia\n3) Enfermagem\n4) Psicologia\n5) Atividade Física\n6) Doação de Sangue',
            ],
          })),
          on: {
            NUTRICAO:         'quick_guidance_nutricao',
            FISIOTERAPIA:     'quick_guidance_fisioterapia',
            ENFERMAGEM:       'quick_guidance_enfermagem',
            PSICOLOGIA:       'quick_guidance_psicologia',
            ATIVIDADE_FISICA: 'quick_guidance_atividade_fisica',
            DOACAO_SANGUE:    'quick_guidance_doacao_sangue',
            USER_INPUT:       'quick_guidance_flow',
          },
        },
        quick_guidance_nutricao: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Qual sub-área você gostaria de receber dicas?\n\n1) Alimentação Básica\n2) Hidratação'],
          })),
          on: {
            ALIMENTACAO_BASICA: 'quick_guidance_nutricao_alimentacao',
            HIDRATACAO:         'quick_guidance_nutricao_hidratacao',
            USER_INPUT:         'quick_guidance_nutricao',
          },
        },
        quick_guidance_nutricao_alimentacao: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🟡 Prefira alimentos naturais no dia a dia: arroz, feijão, verduras, legumes, frutas, ovos e carnes.\n\n🔵 No almoço e jantar:\n- Combine arroz + feijão\n- Inclua verduras e legumes\n- Acrescente uma proteína\n\n🟡 No café da manhã:\n- Opte por cuscuz, tapioca, pão ou frutas\n\n⚠️ Evite ultraprocessados e excesso de sal e açúcar.\n\nFonte: Ministério da Saúde – Guia Alimentar para a População Brasileira.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_nutricao_hidratacao: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💧 Em geral, o consumo pode ficar entre 2 e 3 litros por dia.\n\n📌 Use cerca de 30 a 35 ml por quilo de peso corporal.\nEx: 70kg × 35 = 2.450ml (≈ 2,5 litros/dia)\n\n🍉 Frutas e verduras também contribuem para a hidratação.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_fisioterapia: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Qual sub-área você gostaria de receber dicas?\n\n1) Postura no Dia a Dia\n2) Prevenção de Quedas em Idosos\n3) Gelo ou Calor: qual usar?'],
          })),
          on: {
            POSTURA:          'quick_guidance_fisio_postura',
            PREVENCAO_QUEDAS: 'quick_guidance_fisio_quedas',
            GELO_OU_CALOR:    'quick_guidance_fisio_gelo_calor',
            USER_INPUT:       'quick_guidance_fisioterapia',
          },
        },
        quick_guidance_fisio_postura: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🪑 Sentado: costas apoiadas, pés no chão, evite ficar muito tempo parado.\n🧍 Em pé: levante-se e movimente-se ao longo do dia.\n\n💪 Exercícios de fortalecimento muscular são essenciais para a saúde da coluna.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_fisio_quedas: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '⚠️ Quedas na terceira idade podem causar fraturas graves.\n\n🏠 Adaptações em casa:\n- Retire tapetes soltos\n- Boa iluminação à noite\n- Calçados firmes e antiderrapantes\n- Barras de apoio no banheiro\n\n💪 Pratique atividade física e revise visão, audição e medicamentos.\n\nFonte: INTO',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_fisio_gelo_calor: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🧊 GELO: pancadas recentes (até 48h), inchaço, torções — 15 a 20min, até 3x ao dia.\n\n🔥 CALOR: dores musculares crônicas, tensão — 15 a 20min, até 3x ao dia.\n\n⚠️ Não aplique direto na pele. Não use calor em locais inchados.\n\nFonte: Ministério da Saúde e CUF Saúde',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_enfermagem: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Qual sub-área você gostaria de receber dicas?\n\n1) Cuidados com Feridas\n2) Febre: O que fazer?'],
          })),
          on: {
            CUIDADOS_FERIDAS: 'quick_guidance_enferm_feridas',
            FEBRE:            'quick_guidance_enferm_febre',
            USER_INPUT:       'quick_guidance_enfermagem',
          },
        },
        quick_guidance_enferm_feridas: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🩹 Machucados leves:\n- Lave com água e sabão neutro\n- Não use receitas caseiras\n- Seque e cubra se necessário\n\n⚠️ Procure a UBS se houver: corte profundo, sangramento, secreção, queimadura, picada de animal, ferida no pé.\n\nFonte: Ministério da Saúde',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_enferm_febre: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🌡️ Febre: temperatura ≥ 37,5°C.\n\nEm casa: hidrate-se, descanse, use roupas leves, banho morno.\n\n🚫 Evite: medicamentos sem orientação, álcool ou água gelada no corpo.\n\n🔴 Procure atendimento se: febre > 2 dias, falta de ar, manchas, confusão mental.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_psicologia: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🔴 Sintomas frequentes de ansiedade ou tristeza intensa? Procure a UBS.\n\nQual sub-área você gostaria de receber dicas?\n\n1) Controle de Ansiedade e Stress\n2) Rede de Apoio e CVV\n3) Higiene do Sono',
            ],
          })),
          on: {
            ANSIEDADE_STRESS: 'quick_guidance_psico_ansiedade',
            REDE_APOIO:       'quick_guidance_psico_rede_apoio',
            HIGIENE_SONO:     'quick_guidance_psico_sono',
            USER_INPUT:       'quick_guidance_psicologia',
          },
        },
        quick_guidance_psico_ansiedade: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🧘 Respiração 4-7-8:\n- Inspire pelo nariz contando até 4\n- Segure contando até 7\n- Expire pela boca contando até 8\n\nRepita 4 vezes.\n\n⚠️ Não substitui acompanhamento profissional.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_psico_rede_apoio: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💙 CVV – Centro de Valorização da Vida\n📞 Ligue 188 (24h, gratuito e sigiloso)\n🌐 https://www.cvv.org.br\n\nVocê também pode buscar atendimento em saúde mental na UBS.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_psico_sono: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '😴 Para dormir melhor:\n- Horários regulares para dormir e acordar\n- Evite tela 1h antes de dormir\n- Evite café, chá preto e energéticos à noite\n- Quarto escuro, silencioso e fresco\n- Use a cama só para dormir',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_atividade_fisica: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💪 ⚠️ Antes de praticar: consulte um profissional, comece leve, respeite seus limites e hidrate-se.\n\nQual é a sua faixa etária?\n\n1) Criança (até 5 anos)\n2) Criança e adolescente (6 a 17 anos)\n3) Adulto\n4) Pessoa idosa',
            ],
          })),
          on: {
            CRIANCA_ATE_5:  'quick_guidance_ativ_crianca_ate_5',
            CRIANCA_ATE_17: 'quick_guidance_ativ_crianca_ate_17',
            ADULTO:         'quick_guidance_ativ_adulto',
            IDOSO:          'quick_guidance_ativ_idoso',
            USER_INPUT:     'quick_guidance_atividade_fisica',
          },
        },
        quick_guidance_ativ_crianca_ate_5: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '👶 Até 1 ano: 30min/dia de movimentos de barriga para baixo.\n1-2 anos: 3h/dia (engatinhar, rolar, sentar).\n3-5 anos: 3h/dia (natação, ginástica, danças, brincadeiras).\n\nFonte: Ministério da Saúde',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_ativ_crianca_ate_17: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🧒 60min/dia de atividade moderada a intensa.\n3x/semana de fortalecimento muscular e ósseo.\nA cada 1h sentado, movimente-se 5min.\n\nFonte: Ministério da Saúde',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_ativ_adulto: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🧑 150min/semana moderada ou 75min/semana vigorosa.\n2x/semana de fortalecimento muscular.\nA cada 1h sentado, movimente-se 5min.\n\nFonte: Ministério da Saúde',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_ativ_idoso: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '👴 150min/semana moderada (caminhada, hidroginástica) ou 75min intensa.\n2-3x/semana de fortalecimento e equilíbrio.\nA cada 1h, levante-se por 5min.\n\nAtividades: caminhadas, musculação, hidroginástica, alongamento, jogos ativos.\n\nFonte: Ministério da Saúde',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_doacao_sangue: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '❤️ Sobre doação de sangue, o que deseja saber?\n\n1) Quem pode doar?\n2) Onde doar?\n3) Como funciona a doação?\n4) Cuidados antes da doação\n5) Impedimentos temporários',
            ],
          })),
          on: {
            QUEM_PODE_DOAR: 'quick_guidance_doacao_quem',
            ONDE_DOAR:      'quick_guidance_doacao_onde',
            COMO_FUNCIONA:  'quick_guidance_doacao_como',
            CUIDADOS_ANTES: 'quick_guidance_doacao_cuidados',
            IMPEDIMENTOS:   'quick_guidance_doacao_impedimentos',
            USER_INPUT:     'quick_guidance_doacao_sangue',
          },
        },
        quick_guidance_doacao_quem: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '1️⃣ Quem pode doar:\n- 16 a 69 anos (menores de 18 precisam de autorização)\n- Peso > 50kg\n- Boas condições de saúde\n- Alimentado (sem gordurosos nas 4h antes)\n- Documento com foto\n- Homens: a cada 3 meses (até 4x/ano)\n- Mulheres: a cada 4 meses (até 3x/ano)',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_onde: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '2️⃣ Onde doar:\n🏥 HEMOPE - PETROLINA\nRua Pacífico da Luz, s/n – Centro, Petrolina-PE\n🕐 Segunda a sexta: 7h30 às 11h30\n📞 (87) 3182-5866 | (87) 3866-6601',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_como: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '3️⃣ Como funciona:\n- Cadastro e triagem\n- Entrevista e avaliação clínica\n- Coleta: 10 a 15 minutos\n- ≈ 450ml de sangue\n- Material descartável e seguro',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_cuidados: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '4️⃣ Cuidados antes da doação:\n- Beba bastante líquido nas 24h antes\n- Refeições leves, sem gordurosos\n- Sem álcool nas últimas 12h\n- Durma bem na noite anterior',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_impedimentos: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '5️⃣ Impedimentos temporários:\n- Gripe/resfriado: aguardar 7 dias\n- Antibiótico: últimos 15 dias\n- Gravidez ou amamentação (< 12 meses pós-parto)\n- Tatuagem/piercing: últimos 12 meses\n- Exposição a risco para IST/AIDS',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_retorno: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '❤️ Doar sangue salva vidas!\n\nDeseja receber outra orientação?\n\n1) Voltar ao menu - Doação de Sangue\n2) Voltar ao menu - Orientações\n3) Não - Encerrar',
            ],
          })),
          on: {
            VOLTAR_DOACAO:      'quick_guidance_doacao_sangue',
            VOLTAR_ORIENTACOES: 'quick_guidance_flow',
            ENCERRAR:           'end_session',
            USER_INPUT:         'quick_guidance_doacao_retorno',
          },
        },

        vacinacao_flow: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💉 Olá! Eu posso ajudar com informações sobre vacinação. Aqui você pode consultar:\n\n1) Saber quais vacinas devem ser tomadas\n2) Saber em qual UBS a vacina está disponível\n3) Saber quais documentos levar\n4) Consultar horário da sala de vacinação\n5) Vacinas para grupos especiais',
            ],
          })),
          on: {
            VAC_QUAIS_VACINAS: 'vacinacao_para_quem',
            VAC_QUAL_UBS:      'vacinacao_ubs_inicio',
            VAC_DOCUMENTOS:    'vacinacao_documentos',
            VAC_HORARIO:       'vacinacao_horario_inicio',
            VAC_GRUPOS:        'vacinacao_grupos_especiais',
            USER_INPUT:        'vacinacao_flow',
          },
        },
        vacinacao_para_quem: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Certo. Para te orientar melhor, a vacina é para:\n\n- Criança\n- Adolescente\n- Adulto\n- Idoso\n- Gestante',
            ],
          })),
          on: {
            VAC_CRIANCA:     'vacinacao_crianca_idade',
            VAC_ADOLESCENTE: 'vacinacao_adolescente_idade',
            VAC_ADULTO:      'vacinacao_adulto_tipo',
            VAC_IDOSO:       'vacinacao_idoso_tipo',
            VAC_GESTANTE:    'vacinacao_gestante_fase',
            USER_INPUT:      'vacinacao_para_quem',
          },
        },
        vacinacao_crianca_idade: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Informe a idade da criança:'],
          })),
          on: {
            USER_INPUT: {
              target: 'vacinacao_crianca_resultado',
              actions: assign({ userInput: ({ event }) => event.value }),
            },
          },
        },
        vacinacao_crianca_resultado: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              `💉 Pelo Calendário Nacional de Vacinação, aos 2 meses a criança normalmente entra na etapa de vacinas como penta, VIP, pneumocócica 10-valente e rotavírus, conforme o histórico vacinal.\n\nPara confirmação exata das doses aplicadas e das pendentes, a caderneta deve ser conferida na UBS na sala de vacinação.\n\nA criança informada tem ${context.userInput} — leve sempre a caderneta de vacinação para conferir as doses pendentes.`,
            ],
          })),
          always: { target: 'vacinacao_ubs_sugestao' },
        },
        vacinacao_adolescente_idade: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Informe a idade:'],
          })),
          on: {
            USER_INPUT: {
              target: 'vacinacao_adolescente_resultado',
              actions: assign({ userInput: ({ event }) => event.value }),
            },
          },
        },
        vacinacao_adolescente_resultado: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💉 Para essa faixa etária, o calendário pode incluir vacinas como HPV, meningocócica ACWY e, em certas idades, dengue, além da atualização de hepatite B, dT, febre amarela e tríplice viral conforme o histórico vacinal.\n\nConfira as doses pendentes na caderneta de vacinação na UBS.',
            ],
          })),
          always: { target: 'vacinacao_ubs_sugestao' },
        },
        vacinacao_adulto_tipo: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Você quer saber sobre vacinação de rotina ou sobre atualização de doses atrasadas?'],
          })),
          on: {
            VAC_ROTINA:   'vacinacao_adulto_resultado',
            VAC_ATRASADA: 'vacinacao_adulto_resultado',
            USER_INPUT:   'vacinacao_adulto_tipo',
          },
        },
        vacinacao_adulto_resultado: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💉 Para adultos, o calendário prevê atualização conforme histórico vacinal, com destaque para hepatite B, dT, febre amarela e tríplice viral.\n\nApós esquema completo de dT, o reforço costuma ser recomendado a cada 10 anos, salvo situações específicas de risco.',
            ],
          })),
          always: { target: 'vacinacao_ubs_sugestao' },
        },
        vacinacao_idoso_tipo: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Você quer consultar vacinação de rotina ou campanha ativa?'],
          })),
          on: {
            VAC_ROTINA:   'vacinacao_idoso_rotina',
            VAC_CAMPANHA: 'vacinacao_idoso_campanha',
            USER_INPUT:   'vacinacao_idoso_tipo',
          },
        },
        vacinacao_idoso_rotina: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💉 Para idosos, o calendário prevê atualização conforme histórico vacinal, com destaque para hepatite B, dT, febre amarela e tríplice viral. Após esquema completo de dT, o reforço é recomendado a cada 10 anos.',
            ],
          })),
          always: { target: 'vacinacao_ubs_sugestao' },
        },
        vacinacao_idoso_campanha: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💉 Certo. Campanhas de vacinação disponíveis para idosos:\n\n1) Vacina da gripe\n2) Vacina da Covid-19\n3) Outras campanhas disponíveis na sua UBS',
            ],
          })),
          on: {
            VAC_GRIPE:  'vacinacao_idoso_gripe',
            VAC_COVID:  'vacinacao_idoso_campanha_resultado',
            VAC_OUTRAS: 'vacinacao_idoso_campanha_resultado',
            USER_INPUT: 'vacinacao_idoso_campanha',
          },
        },
        vacinacao_idoso_gripe: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💉 A vacina da gripe é uma das principais campanhas voltadas ao público idoso, importante para a prevenção de complicações causadas por vírus respiratórios.\n\nPara te orientar melhor, informe seu bairro, sua UBS de referência ou o nome da unidade de saúde.',
            ],
          })),
          on: {
            USER_INPUT: {
              target: 'vacinacao_idoso_gripe_ubs',
              actions: assign({ userInput: ({ event }) => event.value }),
            },
          },
        },
        vacinacao_idoso_gripe_ubs: {
          entry: assign(({ context }) => {
            const bairro = context.userInput?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';
            const ubs = Object.entries(UBS_POR_BAIRRO).find(([key]) => bairro.includes(key));
            const ubsInfo = ubs ? ubs[1] : '📍 Não encontrei uma UBS específica para esse bairro.\n' + UBS_PETROLINA.join('\n');
            return {
              responses: [
                ...context.responses,
                `💉 UBS para vacinação nesse bairro:\n\n${ubsInfo}\n\nDeseja consultar:\n1) Horário da vacinação\n2) Documentos necessários\n3) Outra UBS próxima`,
              ],
            };
          }),
          on: {
            VAC_HORARIO_UBS: 'vacinacao_horario_resultado',
            VAC_DOCS_UBS:    'vacinacao_documentos',
            VAC_OUTRA_UBS:   'vacinacao_ubs_lista',
            USER_INPUT:      'vacinacao_idoso_gripe_ubs',
          },
        },
        vacinacao_idoso_campanha_resultado: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💉 Além do local de vacinação, você também deseja saber:\n\n1) O horário de atendimento\n2) Os documentos necessários\n3) Se há outras vacinas de campanha indicadas para idosos',
            ],
          })),
          on: {
            VAC_HORARIO_UBS: 'vacinacao_horario_resultado',
            VAC_DOCS_UBS:    'vacinacao_documentos',
            VAC_OUTRAS_VACS: 'vacinacao_idoso_rotina',
            USER_INPUT:      'vacinacao_idoso_campanha_resultado',
          },
        },
        vacinacao_gestante_fase: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Em qual fase da gestação você está?'],
          })),
          on: {
            USER_INPUT: {
              target: 'vacinacao_gestante_resultado',
              actions: assign({ userInput: ({ event }) => event.value }),
            },
          },
        },
        vacinacao_gestante_resultado: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💉 Na gestação, a orientação depende do histórico vacinal. O calendário 2026 prevê, entre outras vacinas, hepatite B, dT, influenza por temporada, Covid-19 em cada gestação, dTpa a partir da 20ª semana e vacina contra vírus sincicial respiratório a partir da 28ª semana.\n\nDeseja que eu verifique a UBS de Petrolina mais adequada para atendimento?',
            ],
          })),
          on: {
            YES: 'vacinacao_ubs_lista',
            NO:  'vacinacao_retorno',
          },
        },
        vacinacao_ubs_inicio: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Certo. Para te orientar melhor, a vacina é para:\n\n1) Uma vacina específica\n2) A UBS mais próxima do seu bairro',
            ],
          })),
          on: {
            VAC_ESPECIFICA:   'vacinacao_ubs_vacina_especifica',
            VAC_MAIS_PROXIMA: 'vacinacao_ubs_bairro',
            USER_INPUT:       'vacinacao_ubs_inicio',
          },
        },
        vacinacao_ubs_vacina_especifica: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Informe o nome da vacina ou o bairro, sua UBS de referência ou o nome da unidade.'],
          })),
          on: {
            USER_INPUT: {
              target: 'vacinacao_ubs_resultado',
              actions: assign({ userInput: ({ event }) => event.value }),
            },
          },
        },
        vacinacao_ubs_bairro: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Por gentileza, informe o seu bairro.'],
          })),
          on: {
            USER_INPUT: {
              target: 'vacinacao_ubs_resultado',
              actions: assign({ userInput: ({ event }) => event.value }),
            },
          },
        },
        vacinacao_ubs_resultado: {
          entry: assign(({ context }) => {
            const bairro = context.userInput?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';
            const ubs = Object.entries(UBS_POR_BAIRRO).find(([key]) => bairro.includes(key));
            const ubsInfo = ubs ? ubs[1] : '📍 Não encontrei uma UBS específica para esse bairro. Veja as unidades disponíveis:\n' + UBS_PETROLINA.join('\n');
            return {
              responses: [
                ...context.responses,
                `💉 Vou verificar a unidade ou campanha mais próxima para vacinação nesse bairro.\n\n${ubsInfo}\n\nDeseja consultar:\n1) Horário da vacinação\n2) Documentos necessários\n3) Outra UBS próxima`,
              ],
            };
          }),
          on: {
            VAC_HORARIO_UBS: 'vacinacao_horario_resultado',
            VAC_DOCS_UBS:    'vacinacao_documentos',
            VAC_OUTRA_UBS:   'vacinacao_ubs_lista',
            USER_INPUT:      'vacinacao_ubs_resultado',
          },
        },
        vacinacao_ubs_sugestao: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Deseja que eu consulte agora a UBS mais próxima em Petrolina para vacinação?'],
          })),
          on: {
            YES: 'vacinacao_ubs_lista',
            NO:  'vacinacao_retorno',
          },
        },
        vacinacao_ubs_lista: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '📍 UBS de Petrolina com sala de vacinação:\n\n' + UBS_PETROLINA.join('\n') +
              '\n\nDeseja consultar:\n1) Horário da vacinação\n2) Documentos necessários\n3) Outra UBS próxima',
            ],
          })),
          on: {
            VAC_HORARIO_UBS: 'vacinacao_horario_resultado',
            VAC_DOCS_UBS:    'vacinacao_documentos',
            VAC_OUTRA_UBS:   'vacinacao_ubs_lista',
            USER_INPUT:      'vacinacao_ubs_lista',
          },
        },
        vacinacao_documentos: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '📋 Para vacinação em Petrolina, as comunicações oficiais orientam levar:\n\n1. Documento de identificação com foto\n2. Cartão SUS ou CPF\n3. Cartão de vacinação, se tiver\n\nDeseja que eu consulte também a UBS mais próxima ou o horário da vacinação?',
            ],
          })),
          on: {
            YES: 'vacinacao_ubs_lista',
            NO:  'vacinacao_retorno',
          },
        },
        vacinacao_horario_inicio: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Informe o nome da UBS ou o bairro.'],
          })),
          on: {
            USER_INPUT: {
              target: 'vacinacao_horario_resultado',
              actions: assign({ userInput: ({ event }) => event.value }),
            },
          },
        },
        vacinacao_horario_resultado: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🕐 De forma geral, das 8h às 12h e das 14h às 17h está disponível.\n\nComo os horários podem ser alterados conforme a campanha ou vacina específica, pode verificar na unidade básica de saúde.',
            ],
          })),
          always: { target: 'vacinacao_retorno' },
        },
        vacinacao_grupos_especiais: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💉 Grupos especiais inclui indivíduos imunodeficientes ou portadores de outras condições especiais de morbidade ou exposição a situações de risco.\n\nVocê se enquadra nesse grupo?',
            ],
          })),
          on: {
            YES: 'vacinacao_grupos_sim',
            NO:  'vacinacao_retorno',
          },
        },
        vacinacao_grupos_sim: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, '💉 Nesse caso, recomendo que você marque uma consulta na UBS.\n\nGostaria de já deixar marcado sua consulta?'],
          })),
          on: {
            YES: 'schedule_appointment_flow',
            NO:  'vacinacao_grupos_nao',
          },
        },
        vacinacao_grupos_nao: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, '✅ Ok! Se mudar de ideia, é só me chamar.'],
          })),
          always: { target: 'vacinacao_retorno' },
        },
        vacinacao_retorno: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Certo, vamos voltar ao menu inicial.\n\nVoltar ao menu inicial de Vacinação?'],
          })),
          on: {
            YES: 'vacinacao_flow',
            NO:  'menu',
          },
        },

        farmacia_flow: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💊 Você escolheu Farmácia! O que deseja saber?\n\n1) Horário e dias de funcionamento\n2) Endereço\n3) Lista de medicamentos\n4) Orientações',
            ],
          })),
          on: {
            FARMACIA_HORARIO:      'farmacia_horario',
            FARMACIA_ENDERECO:     'farmacia_endereco',
            FARMACIA_MEDICAMENTOS: 'farmacia_medicamentos',
            FARMACIA_ORIENTACOES:  'farmacia_orientacoes',
            USER_INPUT:            'farmacia_flow',
          },
        },
        farmacia_horario: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🕐 Horário de funcionamento:\n\n🏥 UBS: Segunda a sexta: 8h às 12h e 13h às 17h\n\n💊 Farmácia Popular: Segunda a sexta: 8h às 18h | Sábado: 8h às 14h\n\n💊 Farmácia da Família: Segunda a sexta: 7h às 19h\n\n💊 Farmácia do Estado: Segunda a sexta: 7h às 17h\n\n⚠️ A Farmácia do Estado pode depender de agendamento! Popular e Família geralmente atendem por ordem de chegada.',
            ],
          })),
          always: { target: 'farmacia_retorno' },
        },
        farmacia_endereco: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '📍 Endereços:\n\n🏥 UBS (conforme seu cadastro):\n' + UBS_PETROLINA.join('\n') +
              '\n\n💊 Farmácia Popular:\nR. Souza Filho, 600 – Centro, Petrolina-PE\n\n💊 Farmácia da Família:\nAv. Cardoso de Sá, 1200 – Jardim Aeroporto, Petrolina-PE\n\n💊 Farmácia do Estado:\nAv. Agamenon Magalhães, s/n – Centro, Petrolina-PE\n\n📌 Para a mais próxima, acesse o Meu SUS Digital.',
            ],
          })),
          always: { target: 'farmacia_retorno' },
        },
        farmacia_medicamentos: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💊 Lista de medicamentos por farmácia:\n\n🏥 UBS e Farmácia Popular:\nAnti-hipertensivos, antidiabéticos, analgésicos, antibióticos comuns, anticoncepcionais, entre outros.\n\n💊 Farmácia da Família:\nMedicamentos essenciais do Ministério da Saúde para doenças crônicas.\n\n💊 Farmácia do Estado:\nMedicamentos de alto custo: oncologia, HIV, hepatite, entre outros.\n\n⚠️ Não é fornecido estoque, apenas a lista.',
            ],
          })),
          always: { target: 'farmacia_retorno' },
        },
        farmacia_orientacoes: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '📋 Orientações:\n- Use medicamentos só com prescrição médica ou de enfermeiro\n- Verifique o prazo de validade\n- Se tiver sintomas diferentes, procure a UBS\n- Siga corretamente a dose indicada\n- Evite bebidas alcoólicas durante o uso\n\n🔔 Lembrete: Leve sempre a **receita atualizada** e um **documento de identificação (CPF ou Cartão do SUS)**.',
            ],
          })),
          always: { target: 'farmacia_retorno' },
        },
        farmacia_retorno: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Deseja saber mais alguma coisa?\n\n1) Voltar ao menu - Farmácia\n2) Voltar ao menu principal\n3) Não - Encerrar'],
          })),
          on: {
            VOLTAR_FARMACIA: 'farmacia_flow',
            VOLTAR_MENU:     'menu',
            ENCERRAR:        'end_session',
            USER_INPUT:      'farmacia_retorno',
          },
        },
        schedule_appointment_flow: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Ok! Você deseja:\n\n1) Agendar uma consulta\n2) Ver datas de funcionamento dos serviços\n3) Ver consultas agendadas',
            ],
          })),
          on: {
            SCHEDULE:      'schedule_appointment_menu',
            DATAS_SERVICO: 'datas_servico_flow',
            VERIFY:        'query_appointment',
          },
        },
        schedule_appointment_menu: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Certo!\nO que você deseja?:\n1) Consulta médica\n2) Consulta de enfermagem\n3) Consulta e-multi (psicólogo, nutricionista, fisioterapeuta)\n4) Consulta odontológica\n5) Procedimento',
            ],
          })),
          on: {
            USER_INPUT: {
              target: 'appointment_search',
              actions: assign({ userInput: ({ event }) => event.value }),
            },
          },
        },
        appointment_search: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Buscando no sistema...'],
          })),
          invoke: {
            src: 'mapAppointment',
            input: ({ context: { userInput } }) => userInput,
            onDone: {
              target: 'list_appointment_options',
              actions: assign(({ event, context }) => ({
                responses: [...context.responses, event.output.response],
                scheduledDateOptions: event.output.scheduleOptions,
                typeOfAppointment: event.output.typeOfAppointment,
                userInput: undefined,
              })),
            },
            onError: {
              target: 'error',
              actions: assign({ response: 'Erro ao buscar as datas disponíveis. Tente novamente.' }),
            },
          },
        },
        list_appointment_options: {
          on: {
            USER_INPUT: {
              target: 'date_extraction',
              actions: assign({ userInput: ({ event }) => event.value }),
            },
          },
        },
        date_extraction: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Analisando sua resposta...'],
          })),
          invoke: {
            src: 'extractChosenDate',
            input: ({ context: { userInput, scheduledDateOptions } }) => ({ userInput, availableDates: scheduledDateOptions }),
            onDone: {
              target: 'try_schedule_appointment',
              actions: assign({ chosenDate: ({ event }) => event.output.chosenDate }),
            },
            onError: {
              target: 'list_appointment_options',
              actions: assign(({ context }) => ({
                responses: [...context.responses, 'Desculpe, não consegui identificar a data. Por favor, tente digitar a data exata.'],
              })),
            },
          },
        },
        try_schedule_appointment: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Verificando disponibilidade da vaga...'],
          })),
          invoke: {
            src: 'scheduleAppointment',
            input: ({ context: { typeOfAppointment, chosenDate, scheduledDateOptions } }) => ({ typeOfAppointment, chosenDate, scheduledDateOptions }),
            onDone: {
              target: 'schedule_lembrete',
              actions: assign(({ event, context }) => ({
                responses: [...context.responses, `Agendamento feito!\nSeu agendamento ficou para o dia ${event.output.date} às ${event.output.time}`],
                userInput: undefined,
              })),
            },
            onError: {
              target: 'schedule_error_retry',
              actions: assign(({ context }) => ({
                responses: [...context.responses, 'Oops!\nOcorreu um erro na reserva.\nVocê gostaria de tentar novamente com outra data?'],
              })),
            },
          },
        },
        schedule_error_retry: {
          on: { YES: 'appointment_search', NO: 'still_need_help' },
        },
        schedule_lembrete: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Gostaria de ser lembrado(a) da data por e-mail ou SMS?'],
          })),
          on: { YES: 'schedule_lembrete_confirmado', NO: 'schedule_ubs' },
        },
        schedule_lembrete_confirmado: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, '✅ Certo! Você será lembrado(a) da data do seu agendamento.'],
          })),
          always: { target: 'schedule_ubs' },
        },
        schedule_ubs: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Deseja saber qual a UBS ou serviço mais próximo de você?'],
          })),
          on: { YES: 'schedule_ubs_lista', NO: 'still_need_help' },
        },
        schedule_ubs_lista: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '📍 Algumas UBS de Petrolina:\n\n' + UBS_PETROLINA.join('\n') + '\n\n⚠️ Para encontrar a UBS mais próxima, acesse o aplicativo Meu SUS Digital.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        query_appointment: {},
        datas_servico_flow: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, '📅 Qual serviço você gostaria de saber as datas de funcionamento?\n\n1) Médico\n2) Enfermagem\n3) Fisioterapia\n4) Odontologia\n5) Psicologia\n6) Nutrição'],
          })),
          on: {
            SERVICO_MEDICO:       { target: 'datas_servico_resultado', actions: assign({ userInput: 'medico' }) },
            SERVICO_ENFERMAGEM:   { target: 'datas_servico_resultado', actions: assign({ userInput: 'enfermagem' }) },
            SERVICO_FISIOTERAPIA: { target: 'datas_servico_resultado', actions: assign({ userInput: 'fisioterapia' }) },
            SERVICO_ODONTOLOGIA:  { target: 'datas_servico_resultado', actions: assign({ userInput: 'odontologia' }) },
            SERVICO_PSICOLOGIA:   { target: 'datas_servico_resultado', actions: assign({ userInput: 'psicologia' }) },
            SERVICO_NUTRICAO:     { target: 'datas_servico_resultado', actions: assign({ userInput: 'nutricao' }) },
            USER_INPUT:           'datas_servico_flow',
          },
        },
        datas_servico_resultado: {
          entry: assign(({ context }) => {
            const servico = context.userInput as string;
            const datas = DATAS_SERVICOS[servico] || 'Datas não disponíveis no momento.';
            const nomes: Record<string, string> = {
              medico: 'Médico', enfermagem: 'Enfermagem', fisioterapia: 'Fisioterapia',
              odontologia: 'Odontologia', psicologia: 'Psicologia', nutricao: 'Nutrição',
            };
            return {
              responses: [...context.responses, `📅 Datas de funcionamento — ${nomes[servico] || 'Serviço'}:\n\n${datas}\n\n⚠️ Atenção: as datas são para ir presencialmente agendar o atendimento.`],
            };
          }),
          always: { target: 'datas_servico_lembrete' },
        },
        datas_servico_lembrete: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Gostaria de ser lembrado(a) da data por e-mail ou SMS?'],
          })),
          on: { YES: 'datas_servico_lembrete_confirmado', NO: 'datas_servico_ubs' },
        },
        datas_servico_lembrete_confirmado: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, '✅ Certo! Você será lembrado(a) da data do serviço.'],
          })),
          always: { target: 'datas_servico_ubs' },
        },
        datas_servico_ubs: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Deseja saber qual a UBS ou serviço mais próximo de você?'],
          })),
          on: { YES: 'datas_servico_ubs_lista', NO: 'still_need_help' },
        },
        datas_servico_ubs_lista: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '📍 Algumas UBS de Petrolina:\n\n' + UBS_PETROLINA.join('\n') + '\n\n⚠️ Para encontrar a UBS mais próxima, acesse o aplicativo Meu SUS Digital.',
            ],
          })),
          always: { target: 'still_need_help' },
        },

        still_need_help: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Há mais algo em que eu possa ajudar?'],
            response: 'Há mais algo em que eu possa ajudar?',
          })),
          on: { YES: 'menu', NO: 'end_session' },
        },
        error: {
          after: { 500: { target: 'menu' } },
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Desculpe, houve um erro inesperado. Retornando ao menu principal.'],
          })),
        },
        end_session: {
          type: 'final',
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Certo! Obrigada por usar o assistente virtual do SUS!'],
            response: 'Certo! Obrigada por usar o assistente virtual do SUS!',
          })),
        },
      },
    },
    {
      actors: {
        mapAppointment: fromPromise(async ({ input }: { input: number }) => {
          try {
            let typeOfAppointment: string | null;
            const option = Number(input);
            switch (option) {
              case 1: typeOfAppointment = 'consulta_medica'; break;
              case 2: typeOfAppointment = 'consulta_enfermagem'; break;
              case 3: typeOfAppointment = 'consulta_emulti'; break;
              case 4: typeOfAppointment = 'consulta_odontologica'; break;
              case 5: typeOfAppointment = 'marcar_procedimento'; break;
              default: typeOfAppointment = null; break;
            }
            if (typeOfAppointment === null) throw new Error('Não foi possível identificar procedimento');
            const today = new Date();
            const data1 = new Date(today); data1.setDate(today.getDate() + 5);
            const data2 = new Date(today); data2.setDate(today.getDate() + 10);
            const data3 = new Date(today); data3.setDate(today.getDate() + 15);
            const hour = new Date(today); hour.setHours(14, 0);
            const fmt = (h: Date) => `${h.getHours()}:${h.getMinutes() < 10 ? `0${h.getMinutes()}` : h.getMinutes()}`;
            const scheduleOptions = [
              { data: data1.toLocaleDateString(), hora: fmt(hour) },
              { data: data2.toLocaleDateString(), hora: fmt(hour) },
              { data: data3.toLocaleDateString(), hora: fmt(hour) },
            ];
            return {
              scheduleOptions, typeOfAppointment,
              response: 'Certo!\n\nPara essa modalidade temos:\n\n' + scheduleOptions.map((o) => `- ${o.data} às ${o.hora}`).join('\n') + '\nQual a sua disponibilidade?',
            };
          } catch (err) {}
        }),
        extractChosenDate: fromPromise(async ({ input }: { input: any }) => {
          try {
            const availableDatesList = input.availableDates.map((d) => `${d.data} às ${d.hora}`).join(', ');
            const prompt: ChatMessage[] = [
              {
                role: 'system',
                content: `Você é um extrator de datas. Opções disponíveis: ${availableDatesList}. Retorne APENAS JSON: {"chosen_date": "DD/MM/AAAA", "chosen_time": "HH:MM"} ou {"chosen_date": "null"}.`,
              },
              { role: 'user', content: input.userInput },
            ];
            const rawResponse = await groqService.askGroq(prompt);
            const parsed = JSON.parse(rawResponse);
            if (parsed.chosen_date === 'null') throw new Error('Data não identificada.');
            return { chosenDate: parsed.chosen_date, chosenTime: parsed.chosen_time };
          } catch (err) {
            throw new Error(err instanceof Error ? err.message : String(err));
          }
        }),
        scheduleAppointment: fromPromise(async ({ input }: { input: any }) => {
          try {
            const selectedAppointment = input.scheduledDateOptions.find(
              (dateOption) => dateOption.data === input.chosenDate.trim(),
            );
            if (!selectedAppointment) throw new Error('Data ou horário não disponível');
            return { sucess: true, date: selectedAppointment.data, time: selectedAppointment.hora };
          } catch (err) { throw err; }
        }),
      },
    },
  );