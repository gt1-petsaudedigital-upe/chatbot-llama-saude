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
              'Você gostaria de:\n1) Agendar ou confirmar uma consulta ou procedimento\n2) Orientações rápidas\n3) Farmácia',
            ],
          })),
          on: {
            SCHEDULE_APPOINTMENT: 'schedule_appointment_flow',
            QUICK_GUIDANCE:       'quick_guidance_flow',
            FARMACIA:             'farmacia_flow',
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
              'Certo!\nO que você deseja?:\n1) Consulta médica\n2) Consulta de enfermagem\n3) Consulta e-multi (psicólogo, nutricionista, fisioterapeuta)\n4) Consulta odontológica\n5) Procedimento (ex: preventivo, DIU, administração de medicamento, realização de curativo, retirada de ponto, pequena cirurgia)',
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
              target: 'schedule_lembrete',
              actions: assign(({ event, context }) => ({
                responses: [
                  ...context.responses,
                  `Agendamento feito!\nSeu agendamento ficou para o dia ${event.output.date} às ${event.output.time}`,
                ],
                userInput: undefined,
              })),
            },
            onError: {
              target: 'schedule_error_retry',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  'Oops!\nAo tentarmos agendar, ocorreu um erro na reserva.\nVocê gostaria de tentar novamente com outra data?',
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
        schedule_lembrete: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Gostaria de ser lembrado(a) da data por e-mail ou SMS?',
            ],
          })),
          on: {
            YES: 'schedule_lembrete_confirmado',
            NO:  'schedule_ubs',
          },
        },
        schedule_lembrete_confirmado: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '✅ Certo! Você será lembrado(a) da data do seu agendamento.',
            ],
          })),
          always: { target: 'schedule_ubs' },
        },
        schedule_ubs: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Deseja saber qual a UBS ou serviço mais próximo de você?',
            ],
          })),
          on: {
            YES: 'schedule_ubs_lista',
            NO:  'still_need_help',
          },
        },
        schedule_ubs_lista: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '📍 Algumas UBS de Petrolina:\n\n' +
              UBS_PETROLINA.join('\n') +
              '\n\n⚠️ Para encontrar a UBS mais próxima de você, acesse o aplicativo Meu SUS Digital ou ligue para o telefone da sua unidade de referência.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        query_appointment: {},

        datas_servico_flow: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '📅 Qual serviço você gostaria de saber as datas de funcionamento?\n\n1) Médico\n2) Enfermagem\n3) Fisioterapia\n4) Odontologia\n5) Psicologia\n6) Nutrição',
            ],
          })),
          on: {
            SERVICO_MEDICO: {
              target: 'datas_servico_resultado',
              actions: assign({ userInput: 'medico' }),
            },
            SERVICO_ENFERMAGEM: {
              target: 'datas_servico_resultado',
              actions: assign({ userInput: 'enfermagem' }),
            },
            SERVICO_FISIOTERAPIA: {
              target: 'datas_servico_resultado',
              actions: assign({ userInput: 'fisioterapia' }),
            },
            SERVICO_ODONTOLOGIA: {
              target: 'datas_servico_resultado',
              actions: assign({ userInput: 'odontologia' }),
            },
            SERVICO_PSICOLOGIA: {
              target: 'datas_servico_resultado',
              actions: assign({ userInput: 'psicologia' }),
            },
            SERVICO_NUTRICAO: {
              target: 'datas_servico_resultado',
              actions: assign({ userInput: 'nutricao' }),
            },
            USER_INPUT: 'datas_servico_flow',
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
              responses: [
                ...context.responses,
                `📅 Datas de funcionamento — ${nomes[servico] || 'Serviço'}:\n\n${datas}\n\n⚠️ Atenção: as datas apresentadas são para que o usuário vá até o serviço de forma presencial para agendar a data de atendimento.`,
              ],
            };
          }),
          always: { target: 'datas_servico_lembrete' },
        },
        datas_servico_lembrete: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Gostaria de ser lembrado(a) da data por e-mail ou SMS?',
            ],
          })),
          on: {
            YES: 'datas_servico_lembrete_confirmado',
            NO:  'datas_servico_ubs',
          },
        },
        datas_servico_lembrete_confirmado: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '✅ Certo! Você será lembrado(a) da data do serviço.',
            ],
          })),
          always: { target: 'datas_servico_ubs' },
        },
        datas_servico_ubs: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Deseja saber qual a UBS ou serviço mais próximo de você?',
            ],
          })),
          on: {
            YES: 'datas_servico_ubs_lista',
            NO:  'still_need_help',
          },
        },
        datas_servico_ubs_lista: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '📍 Algumas UBS de Petrolina:\n\n' +
              UBS_PETROLINA.join('\n') +
              '\n\n⚠️ Para encontrar a UBS mais próxima de você, acesse o aplicativo Meu SUS Digital ou ligue para o telefone da sua unidade de referência.',
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
              '🔵 No almoço e jantar:\n- Combine arroz + feijão\n- Inclua verduras e legumes\n- Acrescente uma proteína (carne, frango, peixe ou ovo)\n\n' +
              '🟡 No café da manhã:\n- Opte por alimentos simples como cuscuz, tapioca, pão ou frutas\n\n' +
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
              '📌 Uma forma prática de estimar é usar cerca de 30 a 35 ml de água por quilo de peso corporal.\nExemplo: Se você pesa 70kg, a conta é 70 x 35 = 2.450ml (ou seja, quase 2,5 litros por dia).\n\n' +
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
              '🪑 Se trabalha sentado:\n- Mantenha uma boa postura ao sentar, com costas apoiadas e pés no chão\n- Evite ficar muito tempo na mesma posição\n- Levante-se e se movimente ao longo do dia\n- Realize atividades sem sobrecarregar o corpo\n\n' +
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
              '🏠 Manter a casa segura:\n- Retirar tapetes soltos, organizar fios e evitar pisos molhados\n- Garantir boa iluminação, principalmente à noite\n- Usar calçados firmes e antiderrapantes\n- Redobrar os cuidados no banheiro (barras de apoio e tapete antiderrapante)\n\n' +
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
              '🧊 GELO (Compressa Fria):\n- Indicado para pancadas recentes (até 48h), inchaço, torções e inflamações\n- Ajuda a reduzir dor e edema\n- Como usar: 15 a 20 minutos, até 3 vezes ao dia\n\n' +
              '🔥 CALOR (Compressa Quente):\n- Indicado para dores musculares, tensão e dores crônicas, como em dor nas costas ou torcicolo\n- Ajuda a relaxar a musculatura e melhorar a circulação\n- Como usar: 15 a 20 minutos, até 3 vezes ao dia\n\n' +
              '⚠️ Atenção:\n- Não aplicar diretamente na pele\n- Não usar calor em locais inchados ou inflamados\n- Se não houver melhora, procure a unidade de saúde\n\n' +
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
              '- Lave o local com água corrente e sabão neutro (ou soro fisiológico)\n- Não use receitas caseiras (pasta de dente, pó de café, pomadas sem orientação)\n- Seque com um pano limpo e mantenha a área limpa\n- Cubra apenas se houver necessidade\n\nFonte: Ministério da Saúde\n\n' +
              '⚠️ Atenção: Procure a unidade de saúde se houver:\n- Corte profundo ou sangramento abundante\n- Contato com sujeira (terra, objetos enferrujados)\n- Presença de secreção, dor ou vermelhidão\n- Queimaduras\n- Picadas de animais peçonhentos\n- Feridas nos pés ou úlceras\n👉 Em caso de dúvida, procure a unidade básica de saúde.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_enferm_febre: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🌡️ Febre é quando a temperatura corporal está igual ou acima de 37,5°C, em qualquer idade.\n\n' +
              'Na maioria dos casos, você pode começar com cuidados em casa:\n- Hidrate-se\n- Descanse\n- Use roupas leves\n- Pode tomar banho morno\n\n' +
              '🚫 O que evitar:\n- Evite tomar medicamentos sem orientação de um profissional de saúde\n- Não use álcool ou água gelada no corpo\n- Não se agasalhe em excesso\n\n' +
              '🔴 Procure atendimento de saúde se houver:\n- Febre que persiste por 2 dias ou piora\n- Aparecimento de outros sintomas como: falta de ar, confusão ou sonolência excessiva, manchas pelo corpo, dor intensa ou piora do estado geral',
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
              '🧘 Sentindo o coração acelerado ou muita ansiedade?\n\nTente a respiração 4-7-8:\n- Inspire pelo nariz contando até 4\n- Segure o ar contando até 7\n- Solte lentamente pela boca contando até 8\n\nRepita 4 vezes, pois ao focar na sua respiração pode ajudar a acalmar seu corpo e mente.\n\n⚠️ Esta técnica auxilia o relaxamento — mas não substitui acompanhamento profissional.',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_psico_rede_apoio: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💙 Cuidar da saúde mental é essencial.\n\nSe você está com tristeza profunda, angústia ou pensamentos difíceis, além de procurar atendimento em uma UBS, você também pode contar com o Centro de Valorização da Vida pelo número 188.\n\n📞 CVV – Centro de Valorização da Vida\nLigue 188 (24 horas por dia, 7 dias por semana)\nO atendimento é gratuito, sigiloso e funciona 24 horas por dia.\n\nOu acesse: https://www.cvv.org.br',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_psico_sono: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '😴 Para dormir melhor:\n\n- Tente manter horários regulares para dormir e acordar\n- Evite celular e TV pelo menos 1 hora antes de dormir\n- Evite grandes refeições e ingestão de chá preto, café, refrigerantes e energéticos à noite\n- Deixe o quarto escuro, silencioso e mais fresco possível\n- Use a cama apenas para dormir; evite trabalhar nela',
            ],
          })),
          always: { target: 'still_need_help' },
        },

        quick_guidance_atividade_fisica: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💪 Que bom que você quer saber sobre atividade física!\n\n⚠️ Atenção antes de praticar:\n- Procure um profissional de saúde para avaliar sua aptidão física\n- Se você não é ativo, comece com atividades de intensidade leve\n- Respeite os limites do seu corpo\n- Lembre-se de se hidratar bem durante o dia\n\nPara te orientar melhor, qual é a sua faixa etária?\n\n1) Criança (até 5 anos)\n2) Criança e adolescente (6 a 17 anos)\n3) Adulto\n4) Pessoa idosa',
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
              '👶 Criança (até 5 anos):\n\n- Crianças de até 1 ano: realizar pelo menos 30 minutos por dia, estimulando movimentos de barriga para baixo.\n\n- Crianças de 1 a 2 anos: praticar pelo menos 3 horas por dia. Exemplos: engatinhar, rastejar, rolar, sentar e levantar.\n\n- Crianças de 3 a 5 anos: realizar pelo menos 3 horas de atividades físicas por dia. Atividades como natação, ginástica, artes marciais, danças e brincadeiras ativas.\n\nFonte: Ministério da Saúde – Guia de Atividade Física para População Brasileira',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_ativ_crianca_ate_17: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🧒 Criança e Adolescente (6 a 17 anos):\n\n- Praticar pelo menos 60 minutos por dia. Exemplos: Caminhar, correr, nadar, pedalar, jogar futebol, jogar vôlei.\n\n- Incluir pelo menos 3 dias na semana para Fortalecimento muscular e ósseo (saltar, pular corda, cabo de guerra)\n\n- A cada 1h, movimente-se 5 minutos.\n\nFonte: Ministério da Saúde – Guia de Atividade Física para População Brasileira',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_ativ_adulto: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '🧑 Adulto:\n\n- Praticar pelo menos 150 minutos por semana (moderada) ou 75 minutos por semana (vigorosa)\n\n- Incluir pelo menos 2 dias na semana de Fortalecimento muscular\n\n- A cada 1h, movimente-se 5 minutos.\n\nFonte: Ministério da Saúde – Guia de Atividade Física para População Brasileira',
            ],
          })),
          always: { target: 'still_need_help' },
        },
        quick_guidance_ativ_idoso: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '👴 Pessoa Idosa (60+):\n\n- Praticar pelo menos 150 minutos por semana de atividade física moderada (caminhada, hidroginástica) ou 75 minutos de atividade intensa.\n\n- Incluir 2 a 3 vezes por semana exercícios de fortalecimento muscular e equilíbrio.\n\n- A cada 1h, levante-se e movimente-se por 5 minutos.\n\n- Atividades sugeridas: caminhadas, musculação, hidroginástica, alongamentos, jogos ativos, cuidar das plantas.\n\n- Respeitar os próprios limites e priorizar equilíbrio, coordenação e força.\n\nFonte: Ministério da Saúde – Guia de Atividade Física para População Brasileira',
            ],
          })),
          always: { target: 'still_need_help' },
        },

        quick_guidance_doacao_sangue: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '❤️ Que bom que você quer saber sobre doação de sangue! Qual orientação deseja receber?\n\n1) Quem pode doar?\n2) Onde doar?\n3) Como funciona a doação?\n4) Cuidados antes da doação\n5) Impedimentos temporários',
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
              '1️⃣ Quem pode doar?\n\n- Pessoas entre 16 e 69 anos\n- Menores de 18 anos precisam de autorização do responsável\n- Pesar mais de 50 kg\n- Estar em boas condições de saúde\n- Estar alimentado (evite alimentos gordurosos nas 4h que antecedem) e descansado\n- Apresentar documento oficial com foto\n- Homens: a cada 3 meses, até 4 vezes ao ano. Mulheres: a cada 4 meses, até 3 vezes ao ano.',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_onde: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '2️⃣ Onde doar?\n\n🏥 HEMOPE - PETROLINA\nRua Pacífico da Luz, s/n – Centro, Petrolina-PE\n\n🕐 Horário de Atendimento:\nSegunda a sexta-feira 7h30 às 11h30\n\n📞 Telefone: (87) 3182-5866 | (87) 3866-6601',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_como: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '3️⃣ Como funciona a doação?\n\n- Primeiro é realizado cadastro e triagem\n- Depois ocorre entrevista e avaliação clínica\n- A coleta dura cerca de 10 a 15 minutos\n- São doados aproximadamente 450 ml de sangue\n- Todo material utilizado é descartável e seguro',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_cuidados: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '4️⃣ Cuidados antes da doação:\n\n- Beba bastante líquido nas 24h antes\n- Faça refeições leves e evite alimentos gordurosos nas últimas horas\n- Não ingerir bebida alcoólica nas últimas 12h\n- Durma bem na noite anterior',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_impedimentos: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '5️⃣ Impedimentos temporários:\n\n- Gripe, resfriado ou processo alérgico — aguardar 7 dias após desaparecimento dos sintomas\n- Uso de antibiótico nos últimos 15 dias\n- Gravidez ou suspeita de gestação\n- Amamentação antes de 12 meses após o parto\n- Tatuagem, piercing ou micropigmentação nos últimos 12 meses\n- Piercing oral ou genital sem 12 meses da retirada\n- Ter se exposto a situações de risco para IST/AIDS.',
            ],
          })),
          always: { target: 'quick_guidance_doacao_retorno' },
        },
        quick_guidance_doacao_retorno: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '❤️ Doar sangue salva vidas!\n\nDeseja receber outra orientação?\n\n1) Voltar ao menu - Doação de Sangue\n2) Voltar ao menu - Orientações completa\n3) Não - Encerrar',
            ],
          })),
          on: {
            VOLTAR_DOACAO:      'quick_guidance_doacao_sangue',
            VOLTAR_ORIENTACOES: 'quick_guidance_flow',
            ENCERRAR:           'end_session',
            USER_INPUT:         'quick_guidance_doacao_retorno',
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
              '🕐 Horário e dias de funcionamento:\n\n' +
              '🏥 UBS:\nSegunda a sexta-feira: 8h às 12h e 13h às 17h\n\n' +
              '💊 Farmácia Popular:\nSegunda a sexta-feira: 8h às 18h | Sábado: 8h às 14h\n\n' +
              '💊 Farmácia da Família:\nSegunda a sexta-feira: 7h às 19h\n\n' +
              '💊 Farmácia do Estado:\nSegunda a sexta-feira: 7h às 17h\n\n' +
              '⚠️ Atenção: A Farmácia do Estado pode depender de agendamento! A Farmácia Popular e a Farmácia da Família geralmente não precisam (ordem de chegada).',
            ],
          })),
          always: { target: 'farmacia_retorno' },
        },
        farmacia_endereco: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '📍 Endereços:\n\n' +
              '🏥 UBS (conforme seu cadastro):\n' +
              UBS_PETROLINA.join('\n') +
              '\n\n💊 Farmácia Popular:\nR. Souza Filho, 600 – Centro, Petrolina-PE\n\n' +
              '💊 Farmácia da Família:\nAv. Cardoso de Sá, 1200 – Bairro Jardim Aeroporto, Petrolina-PE\n\n' +
              '💊 Farmácia do Estado (SEFAZ):\nAv. Agamenon Magalhães, s/n – Centro, Petrolina-PE\n\n' +
              '📌 Para localizar a farmácia mais próxima, acesse o aplicativo Meu SUS Digital.',
            ],
          })),
          always: { target: 'farmacia_retorno' },
        },
        farmacia_medicamentos: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '💊 Lista de medicamentos por farmácia:\n\n' +
              '🏥 UBS e Farmácia Popular:\nMedicamentos básicos como: anti-hipertensivos, antidiabéticos, antiácidos, analgésicos, antibióticos comuns, anticoncepcionais, entre outros.\n\n' +
              '💊 Farmácia da Família:\nLista mensal de medicamentos essenciais disponibilizada pelo Ministério da Saúde, incluindo medicamentos para doenças crônicas.\n\n' +
              '💊 Farmácia do Estado:\nMedicamentos de alto custo e uso contínuo para doenças específicas (oncologia, HIV, hepatite, entre outros).\n\n' +
              '⚠️ Obs.: Não é fornecido o estoque, apenas a lista dos medicamentos.',
            ],
          })),
          always: { target: 'farmacia_retorno' },
        },
        farmacia_orientacoes: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              '📋 Orientações sobre medicamentos:\n\n' +
              '- Não utilize medicamentos por conta própria. Use apenas com prescrição de médico ou enfermeiro.\n' +
              '- Verifique sempre o prazo de validade dos medicamentos antes de usar.\n' +
              '- Se tiver algum sintoma diferente, procure atendimento na unidade de saúde.\n' +
              '- Siga corretamente as orientações sobre o modo de uso e a dose indicada.\n' +
              '- Evite consumir bebidas alcoólicas durante o uso de medicamentos.\n\n' +
              '🔔 Lembrete:\nLeve sempre a **receita atualizada** e um **documento de identificação (CPF ou Cartão do SUS)** ao procurar atendimento.',
            ],
          })),
          always: { target: 'farmacia_retorno' },
        },
        farmacia_retorno: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Deseja saber mais alguma coisa?\n\n1) Voltar ao menu - Farmácia\n2) Voltar ao menu principal\n3) Não - Encerrar',
            ],
          })),
          on: {
            VOLTAR_FARMACIA: 'farmacia_flow',
            VOLTAR_MENU:     'menu',
            ENCERRAR:        'end_session',
            USER_INPUT:      'farmacia_retorno',
          },
        },

        still_need_help: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Há mais algo em que eu possa ajudar?'],
            response: 'Há mais algo em que eu possa ajudar?',
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

            const response =
              'Certo!\n\nPara essa modalidade temos:\n\n' +
              scheduleOptions.map((o) => `- ${o.data} às ${o.hora}`).join('\n') +
              '\nQual a sua disponibilidade?';

            return { scheduleOptions, typeOfAppointment, response };
          } catch (err) {}
        }),
        extractChosenDate: fromPromise(async ({ input }: { input: any }) => {
          try {
            const availableDatesList = input.availableDates.map((d) => `${d.data} às ${d.hora}`).join(', ');
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