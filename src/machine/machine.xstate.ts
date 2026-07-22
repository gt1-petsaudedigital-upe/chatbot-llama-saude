import { assign, createMachine, fromPromise, StateMachine } from 'xstate';
import { ChatMessage } from '../chat/chat.types';
import { GroqService } from 'src/groq/groq.service';
import { Logger } from '@nestjs/common';

const logger = new Logger(StateMachine.name);

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
          address: {
            neighborhood: '',
            street: '',
            number: '',
            complement: '',
          },
        },
      },
      on: {
        CLEAR_RESPONSES: {
          actions: [assign({ responses: [] })],
        },
      },
      states: {
        start: {
          always: { target: 'load_user' },
        },

        // ── Carrega usuário do banco ──
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
                  address: {
                    neighborhood: '',
                    street: '',
                    number: '',
                    complement: '',
                  },
                },
                responses: [
                  `Olá, **${event.value.name}**! Seus dados foram carregados com sucesso.`,
                ],
              })),
            },
          },
        },

        // ── Menu principal ──
        menu: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Bem-vindo ao menu de serviços!',
              'Você gostaria de: \n 1) Informar um problema de saúde \n 2) Agendar ou confirmar uma consulta ou procedimento \n 3) Orientações rápidas',
            ],
          })),
          on: {
            HEALTH_ISSUE_INFORM:  'health_issue_inform_flow',
            SCHEDULE_APPOINTMENT: 'schedule_appointment_flow',
            QUICK_GUIDANCE:       'quick_guidance_flow',
          },
        },

        // ── Fluxo 1 - Informar problema de saúde ──
        health_issue_inform_flow: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              `Entendi!\nPara te ajudar melhor, preciso saber:\nQual o seu principal sintoma?\n(Febre, dor, tosse, falta de ar, outro...)`,
            ],
          })),
          on: {
            USER_INPUT: {
              target: 'health_issue_analysis',
              actions: assign({ userInput: ({ event }) => event.value }),
            },
          },
        },
        health_issue_analysis: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Analisando sintomas...'],
          })),
          invoke: {
            src: 'askLlamaForSymptomSeverity',
            input: ({ context: { userInput } }) => userInput,
            onDone: [
              {
                target: 'health_issue_mild_symptoms',
                guard: ({ event }) => event.output === 'health_issue_mild_symptoms',
                actions: assign({ userInput: undefined }),
              },
              {
                target: 'health_issue_severe_symptoms',
                guard: ({ event }) => event.output === 'health_issue_severe_symptoms',
                actions: assign({ userInput: undefined }),
              },
            ],
            onError: {
              target: 'error',
              actions: assign(({ context }) => ({
                responses: [...context.responses, 'Erro ao analisar sintomas. Tente novamente.'],
                userInput: undefined,
              })),
            },
          },
        },
        health_issue_mild_symptoms: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              `Com base no que você me relatou, você pode tomar algumas precauções ainda em casa: \nLembre-se de repousar e se hidrate. \nSe os sintomas persistirem ou piorarem, busque a UBS mais próxima de você!`,
            ],
          })),
          after: { 600: { target: 'still_need_help' } },
        },
        health_issue_severe_symptoms: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              `Seus sintomas indicam alerta! \nProcure o hospital mais perto de você para ser atendido prontamente!`,
            ],
          })),
          after: { 600: { target: 'still_need_help' } },
        },

        // ── Fluxo 2 - Agendamento ──
        schedule_appointment_flow: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              `Ok! \nVocê deseja: \n\n1) Agendar uma consulta \n\n2) Ver consultas agendadas`,
            ],
          })),
          on: {
            SCHEDULE: 'schedule_appointment_menu',
            VERIFY:   'query_appointment',
          },
        },
        schedule_appointment_menu: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              `Certo! \nO que você deseja?:\n 1) Consulta médica\n 2) Consulta de enfermagem\n 3) Consulta e-multi (psicológo, nutricionista, fisioterapeuta) \n 4) Consulta odontológica \n 5) Procedimento (ex: preventivo, DIU, administração de medicamento, realização de curativo, retirada de ponto, pequena cirurgia)`,
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
            input: ({ context: { userInput, scheduledDateOptions } }) => ({
              userInput,
              availableDates: scheduledDateOptions,
            }),
            onDone: {
              target: 'try_schedule_appointment',
              actions: assign({ chosenDate: ({ event }) => event.output.chosenDate }),
            },
            onError: {
              target: 'list_appointment_options',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  'Desculpe, não consegui identificar a data e hora na sua mensagem. Por favor, tente digitar a data exata ou o número correspondente à sua escolha.',
                ],
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
            input: ({ context: { typeOfAppointment, chosenDate, scheduledDateOptions } }) => ({
              typeOfAppointment,
              chosenDate,
              scheduledDateOptions,
            }),
            onDone: {
              target: 'still_need_help',
              actions: assign(({ event, context }) => ({
                responses: [
                  ...context.responses,
                  `Agendamento feito!\n Seu agendamento ficou para o dia ${event.output.date} às ${event.output.time}`,
                ],
                userInput: undefined,
              })),
            },
            onError: {
              target: 'schedule_error_retry',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  'Oops! \nAo tentarmos agendar, ocorreu um erro na reserva. \nVocê gostaria de tentar novamente com outra data?',
                ],
              })),
            },
          },
        },
        schedule_error_retry: {
          on: {
            YES: 'appointment_search',
            NO:  'still_need_help',
          },
        },
        query_appointment: {},

        quick_guidance_flow: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '⚠️ Atenção: Estas informações são apenas para orientação básica e não substituem uma avaliação profissional.',
              'Sobre qual área você gostaria de receber orientações?\n\n1) Nutrição\n2) Fisioterapia\n3) Enfermagem\n4) Psicologia\n5) Atividade Física',
            ],
          })),
          on: {
            NUTRICAO:         'quick_guidance_nutricao',
            FISIOTERAPIA:     'quick_guidance_fisioterapia',
            ENFERMAGEM:       'quick_guidance_enfermagem',
            PSICOLOGIA:       'quick_guidance_psicologia',
            ATIVIDADE_FISICA: 'quick_guidance_atividade_fisica',
            USER_INPUT:       'quick_guidance_flow',
          },
        },

        // ── NUTRIÇÃO ──
        quick_guidance_nutricao: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Qual sub-área você gostaria de receber dicas?\n\n1) Alimentação Básica\n2) Hidratação',
            ],
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
              '🟡 Prefira alimentos naturais no dia a dia: arroz, feijão, verduras, legumes, frutas, ovos e carnes.\n\n' +
              '🔵 No almoço e jantar:\n' +
              '- Combine arroz + feijão\n' +
              '- Inclua verduras e legumes\n' +
              '- Acrescente uma proteína (carne, frango, peixe ou ovo)\n\n' +
              '🟡 No café da manhã:\n' +
              '- Opte por alimentos simples como cuscuz, tapioca, pão ou frutas\n\n' +
              '🔵 Procure fazer as refeições com calma e em horários regulares.\n\n' +
              '⚠️ Evite alimentos ultraprocessados (refrigerantes, salgadinhos, biscoitos recheados, embutidos) e excesso de sal e açúcar.\n\n' +
              'Fonte: Ministério da Saúde – Guia Alimentar para a População Brasileira.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_nutricao_hidratacao: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💧 A quantidade de água varia de pessoa para pessoa.\n\n' +
              'Segundo o Ministério da Saúde do Brasil, em geral, o consumo pode ficar entre 2 e 3 litros por dia, dependendo da idade, do peso, da atividade física e do clima.\n\n' +
              '📌 Uma forma prática de estimar é usar cerca de 30 a 35 ml de água por quilo de peso corporal.\n' +
              'Exemplo: Se você pesa 70kg, a conta é 70 x 35 = 2.450ml (ou seja, quase 2,5 litros por dia).\n\n' +
              '💡 Lembre-se: essa é uma estimativa. Suas necessidades podem variar!\n\n' +
              '🍉 A água não é a única forma de se hidratar — alimentos como frutas e verduras também contribuem para a ingestão de líquidos.',
            ],
          })),
          always: { target: 'still_need_help' },
        },

        quick_guidance_fisioterapia: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Qual sub-área você gostaria de receber dicas?\n\n1) Postura no Dia a Dia\n2) Prevenção de Quedas em Idosos\n3) Gelo ou Calor: qual usar?',
            ],
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
              '🪑 Se trabalha sentado:\n' +
              '- Mantenha uma postura confortável, com a coluna apoiada\n' +
              '- Apoie os pés no chão ou em um suporte\n' +
              '- Organize o ambiente de trabalho para evitar esforço excessivo\n' +
              '- Evite permanecer muito tempo na mesma posição\n\n' +
              '🧍 Se fica em pé: Levante-se e movimente-se ao longo do dia, evitando longos períodos parados.\n\n' +
              '✅ Ao realizar tarefas diárias, procure distribuir melhor o esforço e evitar sobrecarga no corpo.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_fisio_quedas: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '⚠️ Atenção: As quedas na terceira idade podem causar fraturas graves, mas pequenas adaptações em casa ajudam muito na prevenção.\n\n' +
              '👟 Cuidado com o chão:\n' +
              '- Retire tapetes soltos (ou use antiderrapantes); evite fios pelo caminho e cuidado com pisos molhados.\n\n' +
              '💡 Iluminação:\n' +
              '- Mantenha a casa bem iluminada, principalmente à noite. Deixe uma luz acesa próxima ao banheiro.\n\n' +
              '👟 Calçados:\n' +
              '- Use sapatos fechados, firmes e com solado antiderrapante. Evite andar de meias, de chinelos frouxos.\n\n' +
              '🚿 Banheiro:\n' +
              '- Local de maior risco. Se possível, use barras de apoio e tapetes antiderrapantes.\n\n' +
              '💪 Importante: Manter a saúde em dia ajuda a prevenir quedas:\n' +
              '- Fortalecer músculos e realizar treinos de equilíbrio\n' +
              '- Praticar atividade física regularmente\n' +
              '- Avaliar visão e audição\n' +
              '- Revisar o uso de medicamentos\n' +
              '- Em caso de tontura ou dificuldade para andar, procure a unidade de saúde.\n\n' +
              'Fonte: Instituto Nacional de Traumatologia e Ortopedia (INTO)',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_fisio_gelo_calor: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🧊 GELO (Compressa Fria):\n' +
              '- Use em pancadas recentes (até 48h), inchaço, torções ou inflamações.\n' +
              '- Ajuda a reduzir a dor e o inchaço.\n' +
              '- Como usar: 15 a 20 minutos, até 3 vezes ao dia.\n\n' +
              '🔥 CALOR (Compressa Quente):\n' +
              '- Use em dores musculares, tensão ou dores crônicas (há mais de 3 meses), como em dor nas costas ou no torcicolo.\n' +
              '- Ajuda a relaxar o músculo e a melhorar a circulação.\n' +
              '- Como usar: 15 a 20 minutos, até 3 vezes ao dia.\n\n' +
              'Fonte: Ministério da Saúde e CUF Saúde',
            ],
          })),
          always: { target: 'still_need_help' },
        },

        quick_guidance_enfermagem: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Qual sub-área você gostaria de receber dicas?\n\n1) Cuidados com Feridas\n2) Febre: O que fazer?',
            ],
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
              '🩹 O que fazer em caso de feridas leves (cortes, arranhões):\n\n' +
              '1. Lave o local com água corrente e sabão neutro.\n' +
              '2. Não use partes estragadas.\n' +
              '3. Seque com um pano limpo (faça movimentos de toque, não esfregue).\n' +
              '4. Cubra com um curativo limpo e troque diariamente ou quando necessário.\n\n' +
              '⚠️ Atenção: Procure a unidade de saúde se houver:\n' +
              '- Sinais de infecção (vermelhidão, inchaço, pus)\n' +
              '- Ferida profunda ou que não para de sangrar\n' +
              '- Dúvida sobre necessidade de ponto ou vacina antitetânica\n\n' +
              'Fonte: Ministério da Saúde',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_enferm_febre: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🌡️ Temperatura acima de 37,8°C já pode ser considerada febre para adultos.\n\n' +
              'Em casa você pode:\n' +
              '- Repousar\n' +
              '- Hidratar-se bem\n' +
              '- Usar roupas leves\n' +
              '- Medicamentos (somente se recomendados pelo médico)\n\n' +
              '🔴 Procure atendimento de saúde se houver:\n' +
              '- Febre acima de 39°C ou que persiste por mais de 3 dias\n' +
              '- Febre com manchas na pele, confusão mental, dificuldade para respirar\n' +
              '- Febre em bebês com menos de 3 meses\n' +
              '- Convulsão por causa da febre',
            ],
          })),
          always: { target: 'still_need_help' },
        },

        quick_guidance_psicologia: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🔴 Se você está com sintomas frequentes de ansiedade, tristeza intensa, desânimo ou dificuldade para realizar atividades do dia a dia, procure atendimento na UBS.\n\n' +
              'Qual sub-área você gostaria de receber dicas?\n\n1) Controle de Ansiedade e Stress\n2) Rede de Apoio e Centro de Valorização da Vida\n3) Higiene do Sono',
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
              '🧘 Algumas técnicas que podem ajudar no controle da ansiedade e do stress:\n\n' +
              '- Respiração profunda: inspire devagar pelo nariz (4s), segure (4s), e expire pela boca (4s)\n' +
              '- Respire profundamente ao sentir a ansiedade aumentar\n' +
              '- Tente nomear o que está sentindo (ex: "estou ansioso por causa de X")\n' +
              '- Pratique atividade física regularmente\n' +
              '- Saia um pouco para tomar ar e se movimentar\n' +
              '- Reduza o tempo em redes sociais e notícias negativas\n\n' +
              '⚠️ Esta técnica auxilia o relaxamento e pode ajudar a reduzir momentos de ansiedade e estresse — mas não substitui acompanhamento profissional.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_psico_rede_apoio: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💙 Se você ou alguém que você conhece está passando por um momento muito difícil, saiba que não precisa enfrentar isso sozinho.\n\n' +
              'Se precisar de apoio emocional ou estiver em crise, você pode ligar para o:\n\n' +
              '📞 CVV – Centro de Valorização da Vida\n' +
              'Ligue 188 (24 horas por dia, 7 dias por semana)\n' +
              'Ou acesse: https://www.cvv.org.br\n\n' +
              'Você também pode buscar atendimento em saúde mental na UBS mais próxima de você.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_psico_sono: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '😴 Para dormir melhor:\n\n' +
              '- Tente manter horários regulares para dormir e acordar\n' +
              '- Evite celular e TV pelo menos 1 hora antes de dormir\n' +
              '- Evite grandes refeições e ingestão de chá preto, café, refrigerantes e energéticos à noite\n' +
              '- Deixe o quarto escuro, silencioso e mais fresco possível\n' +
              '- Use a cama apenas para dormir; evite trabalhar nela',
            ],
          })),
          always: { target: 'still_need_help' },
        },

        quick_guidance_atividade_fisica: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💪 Que bom que você quer saber sobre atividade física! Se movimentar faz muito bem para a saúde.\n\n' +
              'Para te orientar melhor, qual é a sua faixa etária?\n\n' +
              '1) Criança (até 5 anos)\n' +
              '2) Criança e adolescente (6 a 17 anos)\n' +
              '3) Adulto\n' +
              '4) Pessoa idosa',
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
              '👶 A atividade física pode fazer parte de vários momentos do dia da criança:\n\n' +
              '🚶 No deslocamento\n' +
              '📚 Na escola\n' +
              '🏠 Nas brincadeiras em casa\n' +
              '🎮 No tempo livre\n\n' +
              'De maneira geral, é recomendado que crianças de até 5 anos se movimentem de forma ativa ao longo do dia, com brincadeiras livres e atividades lúdicas.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_ativ_crianca_ate_17: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🧒 A atividade física pode fazer parte de vários momentos do dia:\n\n' +
              '🚶 No deslocamento\n' +
              '📚 No trabalho/escola\n' +
              '🏠 Nas tarefas domésticas\n' +
              '🎮 No tempo livre\n\n' +
              'De maneira geral, é recomendado 60 minutos de atividade física moderada a intensa por dia para crianças e adolescentes de 6 a 17 anos.\n\n' +
              'Importante incluir exercícios de fortalecimento muscular pelo menos 2 vezes por semana.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_ativ_adulto: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🧑 A atividade física pode fazer parte de vários momentos do seu dia:\n\n' +
              '🚶 No deslocamento\n' +
              '💼 No trabalho\n' +
              '🏠 Nas tarefas domésticas\n' +
              '🎮 No tempo livre\n\n' +
              'De maneira geral, é recomendado 150 minutos por semana de atividade física moderada ou 75 minutos por semana de atividade intensa.\n\n' +
              'Importante incluir exercícios de fortalecimento muscular pelo menos 2 vezes por semana.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_ativ_idoso: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '👴 A atividade física pode fazer parte de vários momentos do seu dia:\n\n' +
              '🚶 No deslocamento\n' +
              '🏠 Nas tarefas domésticas\n' +
              '🎮 No tempo livre\n\n' +
              'De maneira geral, é recomendado 150 minutos por semana de atividade física moderada ou 75 minutos por semana de atividade intensa.\n\n' +
              'Importante incluir exercícios de equilíbrio e fortalecimento muscular pelo menos 3 vezes por semana para prevenção de quedas.',
            ],
          })),
          always: { target: 'still_need_help' },
        },

        still_need_help: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, `Há mais algo em que eu possa ajudar?`],
            response: `Há mais algo em que eu possa ajudar?`,
          })),
          on: {
            YES: 'menu',
            NO:  'end_session',
          },
        },
        error: {
          after: { 500: { target: 'menu' } },
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Desculpe, houve um erro inesperado. Retornando ao menu principal.',
            ],
          })),
        },
        end_session: {
          type: 'final',
          entry: assign(({ context }) => ({
            responses: [...context.responses, `Certo! Obrigada por usar o assistente virtual do SUS!`],
            response: `Certo! Obrigada por usar o assistente virtual do SUS!`,
          })),
        },
      },
    },
    {
      actors: {
        askLlamaForSymptomSeverity: fromPromise(
          async ({ input }: { input: string }) => {
            try {
              if (!input) throw new Error('Input inválido');
              const prompt: ChatMessage[] = [
                {
                  role: 'system',
                  content:
                    'Analise os sintomas e classifique como leves ou graves. Retorne apenas: {"response": "Sua resposta", "nextState": "health_issue_mild_symptoms" ou "health_issue_severe_symptoms"}',
                },
                { role: 'user', content: input },
              ];
              const rawResponse = await groqService.askGroq(prompt);
              const parsed = JSON.parse(rawResponse) as { response: string; nextState: string };
              return parsed.nextState;
            } catch (error) {
              return { response: 'Erro na análise. Tente novamente.', nextState: 'error' };
            }
          },
        ),
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

            const fmt = (h: Date) =>
              `${h.getHours()}:${h.getMinutes() < 10 ? `0${h.getMinutes()}` : h.getMinutes()}`;

            const scheduleOptions = [
              { data: data1.toLocaleDateString(), hora: fmt(hour) },
              { data: data2.toLocaleDateString(), hora: fmt(hour) },
              { data: data3.toLocaleDateString(), hora: fmt(hour) },
            ];

            const response =
              'Certo!\n\n Para essa modalidade temos: \n\n' +
              scheduleOptions.map((o) => `- ${o.data} às ${o.hora}`).join('\n') +
              '\nQual a sua disponibilidade?';

            return { scheduleOptions, typeOfAppointment, response };
          } catch (err) {}
        }),
        extractChosenDate: fromPromise(async ({ input }: { input: any }) => {
          try {
            const availableDatesList = input.availableDates
              .map((d) => `${d.data} às ${d.hora}`)
              .join(', ');
            const prompt: ChatMessage[] = [
              {
                role: 'system',
                content: `Você é um extrator de datas. O usuário escolheu uma data e hora dentre as opções disponíveis: ${availableDatesList}.
                Sua única tarefa é extrair a data (no formato DD/MM/AAAA) e a hora (no formato HH:MM) que o usuário escolheu.
                Se o usuário mencionar mais de uma data, escolha a primeira. Se nenhuma data for clara, retorne 'null'.
                Retorne APENAS um objeto JSON no formato: {"chosen_date": "DD/MM/AAAA", "chosen_time": "HH:MM"} ou {"chosen_date": "null"}.`,
              },
              { role: 'user', content: input.userInput },
            ];
            const rawResponse = await groqService.askGroq(prompt);
            const parsed = JSON.parse(rawResponse);
            if (parsed.chosen_date === 'null') throw new Error('Data não identificada ou inválida.');
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
            if (!selectedAppointment) throw new Error('Data ou horário selecionado não disponível');
            return { sucess: true, date: selectedAppointment.data, time: selectedAppointment.hora };
          } catch (err) {
            throw err;
          }
        }),
      },
    },
  );