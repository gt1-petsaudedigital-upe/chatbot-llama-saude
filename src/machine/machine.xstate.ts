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
              '- Mantenha uma boa postura ao sentar, com costas apoiadas e pés no chão\n' +
              '- Evite ficar muito tempo na mesma posição\n' +
              '- Levante-se e se movimente ao longo do dia\n' +
              '- Realize atividades sem sobrecarregar o corpo\n\n' +
              '💪 Segundo o Ministério da Saúde do Brasil, a prática regular de atividade física, incluindo exercícios de fortalecimento muscular, é essencial para prevenir dores e manter a saúde da coluna.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_fisio_quedas: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '⚠️ Atenção: As quedas na terceira idade podem causar fraturas graves, mas pequenas adaptações em casa ajudam muito na prevenção.\n\n' +
              '🏠 Manter a casa segura:\n' +
              '- Retirar tapetes soltos, organizar fios e evitar pisos molhados\n' +
              '- Garantir boa iluminação, principalmente à noite\n' +
              '- Usar calçados firmes e antiderrapantes\n' +
              '- Redobrar os cuidados no banheiro (barras de apoio e tapete antiderrapante)\n\n' +
              '💪 Manter a saúde em dia com atividade física, fortalecimento muscular e revisão da visão, audição e medicamentos\n\n' +
              '🏥 Procurar a unidade de saúde em caso de tontura ou dificuldade para andar\n\n' +
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
              '- Indicado para pancadas recentes (até 48h), inchaço, torções e inflamações\n' +
              '- Ajuda a reduzir dor e edema\n' +
              '- Como usar: 15 a 20 minutos, até 3 vezes ao dia\n\n' +
              '🔥 CALOR (Compressa Quente):\n' +
              '- Indicado para dores musculares, tensão e dores crônicas (aproximadamente 3 meses), como em dor nas costas ou torcicolo\n' +
              '- Ajuda a relaxar a musculatura e melhorar a circulação\n' +
              '- Como usar: 15 a 20 minutos, até 3 vezes ao dia\n\n' +
              '⚠️ Atenção:\n' +
              '- Não aplicar diretamente na pele\n' +
              '- Não usar calor em locais inchados ou inflamados\n' +
              '- Se não houver melhora, procure a unidade de saúde\n\n' +
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
              '🩹 O que fazer em machucados leves em casa:\n\n' +
              '- Lave o local com água corrente e sabão neutro (ou soro fisiológico)\n' +
              '- Não use receitas caseiras (pasta de dente, pó de café, pomadas sem orientação)\n' +
              '- Seque com um pano limpo e mantenha a área limpa\n' +
              '- Cubra apenas se houver necessidade\n\n' +
              'Fonte: Ministério da Saúde\n\n' +
              '⚠️ Atenção: Procure a unidade de saúde se houver:\n' +
              '- Corte profundo ou sangramento abundante\n' +
              '- Contato com sujeira (terra, objetos enferrujados)\n' +
              '- Presença de secreção, dor ou vermelhidão\n' +
              '- Queimaduras\n' +
              '- Picadas de animais peçonhentos\n' +
              '- Feridas nos pés ou úlceras\n' +
              '👉 Em caso de dúvida, procure a unidade básica de saúde.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_enferm_febre: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🌡️ Febre é quando a temperatura corporal está igual ou acima de 37,5°C, em qualquer idade.\n\n' +
              'Na maioria dos casos, você pode começar com cuidados em casa:\n' +
              '- Hidrate-se\n' +
              '- Descanse\n' +
              '- Use roupas leves\n' +
              '- Pode tomar banho morno\n\n' +
              '🚫 O que evitar:\n' +
              '- Evite tomar medicamentos sem orientação de um profissional de saúde\n' +
              '- Não use álcool ou água gelada no corpo\n' +
              '- Não se agasalhe em excesso\n\n' +
              '🔴 Procure atendimento de saúde se houver:\n' +
              '- Febre que persiste por 2 dias ou piora\n' +
              '- Aparecimento de outros sintomas como: falta de ar, confusão ou sonolência excessiva, manchas pelo corpo, dor intensa ou piora do estado geral',
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
              '🧘 Sentindo o coração acelerado ou muita ansiedade?\n\n' +
              'Tente a respiração 4-7-8:\n' +
              '- Inspire pelo nariz contando até 4\n' +
              '- Segure o ar contando até 7\n' +
              '- Solte lentamente pela boca contando até 8\n\n' +
              'Repita 4 vezes, pois ao focar na sua respiração pode ajudar a acalmar seu corpo e mente.\n\n' +
              '⚠️ Esta técnica auxilia o relaxamento e pode ajudar a reduzir momentos de ansiedade e estresse — mas não substitui acompanhamento profissional.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_psico_rede_apoio: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💙 Cuidar da saúde mental é essencial.\n\n' +
              'Se você está com tristeza profunda, angústia ou pensamentos difíceis, além de procurar atendimento em uma UBS, você também pode contar com o Centro de Valorização da Vida pelo número 188.\n\n' +
              '📞 CVV – Centro de Valorização da Vida\n' +
              'Ligue 188 (24 horas por dia, 7 dias por semana)\n' +
              'O atendimento é gratuito, sigiloso e funciona 24 horas por dia.\n\n' +
              'Ou acesse: https://www.cvv.org.br',
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
              '⚠️ Atenção antes de praticar atividade física:\n' +
              '- Procure um profissional de saúde para avaliar sua aptidão física\n' +
              '- Se você não é ativo, comece com atividades de intensidade leve\n' +
              '- Respeite os limites do seu corpo e interrompa a atividade se sentir dor no peito, tontura ou qualquer desconforto\n' +
              '- Lembre-se de se hidratar bem durante o dia\n\n' +
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
              '👶 Criança (até 5 anos):\n\n' +
              '- Crianças de até 1 ano: realizar pelo menos 30 minutos por dia, estimulando movimentos de barriga para baixo, que podem ser distribuídos ao longo do dia.\n\n' +
              '- Crianças de 1 a 2 anos: praticar pelo menos 3 horas por dia de atividades físicas. Exemplos: engatinhar, rastejar, rolar, sentar e levantar.\n\n' +
              '- Crianças de 3 a 5 anos: realizar pelo menos 3 horas de atividades físicas por dia. Atividades como natação, ginástica, artes marciais, danças e brincadeiras ativas no recreio escolar.\n\n' +
              'Fonte: Ministério da Saúde – Guia de Atividade Física para População Brasileira',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_ativ_crianca_ate_17: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🧒 Criança e Adolescente (6 a 17 anos):\n\n' +
              '- Praticar pelo menos 60 minutos por dia — dê preferência a atividades que façam a respiração e os batimentos do coração aumentarem. Exemplos: Caminhar, correr, nadar, pedalar (andar de bicicleta), jogar futebol, jogar vôlei.\n\n' +
              '- Incluir pelo menos 3 dias na semana para Fortalecimento muscular e ósseo (saltar, pular corda, puxar ou empurrar - cabo de guerra)\n\n' +
              '- A cada 1h, movimente-se 5 minutos — reduza o tempo sentado ou deitado usando o celular ou assistindo TV.\n\n' +
              'Fonte: Ministério da Saúde – Guia de Atividade Física para População Brasileira',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_ativ_adulto: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🧑 Adulto:\n\n' +
              '- Praticar pelo menos 150 minutos por semana de (moderada) ou pelo menos 75 minutos por semana (vigorosa)\n\n' +
              '- Incluir pelo menos 2 dias na semana — Fortalecimento muscular (musculação e exercícios com peso do corpo)\n\n' +
              '- A cada 1h, movimente-se 5 minutos — reduza o tempo sentado ou deitado usando o celular ou assistindo TV.\n\n' +
              'Fonte: Ministério da Saúde – Guia de Atividade Física para População Brasileira',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_ativ_idoso: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '👴 Pessoa Idosa (60+):\n\n' +
              '- Praticar pelo menos 150 minutos por semana de atividade física moderada (caminhada, hidroginástica) ou pelo menos 75 minutos por semana de atividade mais intensa (corrida, ciclismo).\n\n' +
              '- Incluir 2 a 3 vezes por semana em dias alternados — Exercícios para fortalecimento muscular (musculação orientada e exercícios com o peso do corpo) e equilíbrio\n\n' +
              '- A cada 1h, levante-se e movimente-se por 5 minutos.\n\n' +
              '- Atividades sugeridas: Caminhadas, programas orientados (musculação, hidroginástica, alongamentos ou dança), jogos ativos (sinuca), cuidar das plantas, passear com animal de estimação, entre outros.\n\n' +
              '- Respeitar os próprios limites e adaptar a intensidade conforme a condição física.\n' +
              '- Priorizar equilíbrio, coordenação e força.\n\n' +
              'Fonte: Ministério da Saúde – Guia de Atividade Física para População Brasileira',
            ],
          })),
          always: { target: 'still_need_help' },
        },

        quick_guidance_doacao_sangue: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '❤️ Que bom que você quer saber sobre doação de sangue! Qual orientação deseja receber?\n\n' +
              '1) Quem pode doar?\n' +
              '2) Onde doar?\n' +
              '3) Como funciona a doação?\n' +
              '4) Cuidados antes da doação\n' +
              '5) Impedimentos temporários',
            ],
          })),
          on: {
            QUEM_PODE_DOAR:     'quick_guidance_doacao_quem',
            ONDE_DOAR:          'quick_guidance_doacao_onde',
            COMO_FUNCIONA:      'quick_guidance_doacao_como',
            CUIDADOS_ANTES:     'quick_guidance_doacao_cuidados',
            IMPEDIMENTOS:       'quick_guidance_doacao_impedimentos',
            USER_INPUT:         'quick_guidance_doacao_sangue',
          },
        },
        quick_guidance_doacao_quem: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '1️⃣ Quem pode doar?\n\n' +
              '- Pessoas entre 16 e 69 anos\n' +
              '- Menores de 18 anos precisam de autorização do responsável\n' +
              '- Pesar mais de 50 kg\n' +
              '- Estar em boas condições de saúde\n' +
              '- Estar alimentado (evite alimentos gordurosos nas 4h que antecedem) e descansado\n' +
              '- Apresentar documento oficial com foto\n' +
              '- Homens podem doar sangue a cada 3 meses, até 4 vezes ao ano. Já as mulheres podem doar a cada 4 meses, até 3 vezes ao ano.',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_onde: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '2️⃣ Onde doar?\n\n' +
              '🏥 HEMOPE - PETROLINA\n' +
              'Rua Pacífico da Luz, s/n – Centro, Petrolina-PE\n\n' +
              '🕐 Horário de Atendimento:\n' +
              'Segunda a sexta-feira 7h30 às 11h30\n\n' +
              '📞 Telefone: (87) 3182-5866 | (87) 3866-6601',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_como: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '3️⃣ Como funciona a doação?\n\n' +
              '- Primeiro é realizado cadastro e triagem\n' +
              '- Depois ocorre entrevista e avaliação clínica\n' +
              '- A coleta dura cerca de 10 a 15 minutos\n' +
              '- São doados aproximadamente 450 ml de sangue\n' +
              '- Todo material utilizado é descartável e seguro',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_cuidados: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '4️⃣ Cuidados antes da doação:\n\n' +
              '- Beba bastante líquido nas 24h antes\n' +
              '- Faça refeições leves e evite alimentos gordurosos nas últimas horas\n' +
              '- Não ingerir bebida alcoólica nas últimas 12h\n' +
              '- Durma bem na noite anterior',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_impedimentos: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '5️⃣ Impedimentos temporários:\n\n' +
              '- Gripe, resfriado ou processo alérgico — aguardar 7 dias após desaparecimento dos sintomas\n' +
              '- Uso de antibiótico nos últimos 15 dias\n' +
              '- Gravidez ou suspeita de gestação\n' +
              '- Amamentação antes de 12 meses após o parto\n' +
              '- Tatuagem, piercing ou micropigmentação nos últimos 12 meses\n' +
              '- Piercing oral ou genital sem 12 meses da retirada\n' +
              '- Ter se exposto a situações de risco para IST/AIDS.',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_retorno: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '❤️ Doar sangue salva vidas!\n\n' +
              'Deseja receber outra orientação?\n\n' +
              '1) Voltar ao menu - Doação de Sangue\n' +
              '2) Voltar ao menu - Orientações completa\n' +
              '3) Não - Encerrar',
            ],
          })),
          on: {
            VOLTAR_DOACAO:     'quick_guidance_doacao_sangue',
            VOLTAR_ORIENTACOES: 'quick_guidance_flow',
            ENCERRAR:          'end_session',
            USER_INPUT:        'quick_guidance_doacao_retorno',
          },
        },

        // ── Estados finais compartilhados ──
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