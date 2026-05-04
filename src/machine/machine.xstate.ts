import { assign, createMachine, fromPromise, StateMachine } from 'xstate';
import { ChatMessage } from '../chat/chat.types';
import { GroqService } from 'src/groq/groq.service';
import { VaccinationData, vacinacao } from 'src/data/vacina.data';
import { Logger } from '@nestjs/common';
import { error } from 'console';

interface ChatflowContext {
  userInput: string;
  response: string;
  responses: string[];
  nextState?: string;
}

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
          address: {
            neighborhood: '',
            street: '',
            number: '',
            complement: '',
          },
          hasHealthProfessionalName: false,
          healthProfessionalName: '',
        },
      },
      on: {
        CLEAR_RESPONSES: {
          actions: [
            assign({
              responses: [],
            }),
          ],
        },
      },
      states: {
        start: {
          always: {
            target: 'collect_name',
          },
        },
        collect_name: {
          on: {
            USER_INPUT: [
              {
                target: 'validate_name',
                guard: ({ event: { value } }) => value.trim() !== '',
                actions: assign(({ event }) => ({
                  userInput: event.value,
                })),
              },
              {
                target: 'collect_name',
                actions: assign(({ context }) => ({
                  responses: [
                    ...context.responses,
                    'Por favor, digite seu nome completo para prosseguir.',
                  ],
                })),
              },
            ],
          },
        },
        validate_name: {
          entry: assign(({ context: { responses, userInput } }) => ({
            responses: [
              ...responses,
              `Você digitou **${userInput}** como seu nome. \n Está correto?`,
            ],
          })),
          on: {
            NO: {
              target: 'collect_name',
              actions: assign(({ context: { responses } }) => ({
                responses: [
                  ...responses,
                  `Tudo bem! Vamos pedir seu nome de novo!`,
                  `Informe seu Nome Completo`,
                ],
              })),
            },
            YES: {
              target: 'check_if_social_name',
              actions: assign(
                ({ context: { userInput, userInformation } }) => ({
                  userInformation: {
                    ...userInformation,
                    name: userInput,
                  },
                }),
              ),
            },
            // Fallback: usuário digitou outra coisa em vez de Sim/Não
            USER_INPUT: {
              target: 'validate_name',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  'Por favor, responda com "Sim" ou "Não" para confirmar seu nome.',
                ],
              })),
            },
          },
        },
        check_if_social_name: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Obrigado! Agora, gostaria de saber: você tem Nome Social? (Sim/Não)\n (Nome social é o nome pelo qual uma pessoa se identifica e prefere ser chamada na sociedade, refletindo sua identidade de gênero, diferente do nome de registro civil).',
            ],
          })),
          on: {
            YES: {
              target: 'collect_social_name',
              actions: assign(({ context }) => ({
                userInformation: {
                  ...context.userInformation,
                  hasSocialName: true,
                },
                responses: [
                  ...context.responses,
                  'Entendi! Por favor, digite o Nome Social.',
                ],
              })),
            },
            NO: {
              target: 'collect_birth_date',
              actions: assign(({ context }) => ({
                userInformation: {
                  ...context.userInformation,
                  hasSocialName: false,
                  socialName: '',
                },
                responses: [
                  ...context.responses,
                  'Certo. **Não há nome social**. Próximo passo...',
                ],
              })),
            },
            USER_INPUT: {
              target: 'check_if_social_name',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  `Por favor, informe com "Sim" ou "Não" se você tem Nome Social.`,
                ],
              })),
            },
          },
        },
        collect_social_name: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Entendido. Por favor, digite seu Nome Social para que eu possa confirmá-lo.',
            ],
            userInput: undefined,
          })),
          on: {
            USER_INPUT: [
              {
                target: 'validate_social_name',
                guard: ({ event: { value } }) => value.trim() !== '',
                actions: assign(({ event }) => ({
                  userInput: event.value,
                })),
              },
              {
                target: 'collect_social_name',
                actions: assign(({ context }) => ({
                  responses: [
                    ...context.responses,
                    'O Nome Social não pode ser vazio. Por favor, digite o nome.',
                  ],
                })),
              },
            ],
          },
        },
        validate_social_name: {
          entry: assign(({ context: { responses, userInput } }) => ({
            responses: [
              ...responses,
              `Você digitou "${userInput}" como seu Nome Social. \n Está correto? (Sim/Não)`,
            ],
          })),
          on: {
            NO: {
              target: 'collect_social_name',
              actions: assign(({ context: { responses } }) => ({
                responses: [
                  ...responses,
                  `Tudo bem! Por favor, digite seu Nome Social novamente.`,
                ],
              })),
            },
            YES: {
              target: 'collect_birth_date',
              actions: assign(({ context }) => ({
                userInformation: {
                  ...context.userInformation,
                  socialName: context.userInput,
                },
                responses: [
                  ...context.responses,
                  `Nome Social confirmado! Agora vamos para o próximo passo.`,
                ],
                userInput: undefined,
              })),
            },
            // Fallback: usuário digitou outra coisa em vez de Sim/Não
            USER_INPUT: {
              target: 'validate_social_name',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  `Por favor, responda com "Sim" ou "Não" para confirmar o Nome Social.`,
                ],
              })),
            },
          },
        },
        collect_birth_date: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Agora, por favor, me informe sua **Data de Nascimento** no formato **DD/MM/AAAA** (Ex: 01/01/2000).',
            ],
            userInput: undefined,
          })),
          on: {
            USER_INPUT: {
              target: 'validate_birth_date',
              actions: assign(({ event }) => ({
                userInput: event.value,
              })),
            },
          },
        },
        validate_birth_date: {
          invoke: {
            src: 'validateDate',
            input: ({ context: { userInput } }) => userInput,
            onDone: {
              target: 'confirm_birth_date',
            },
            onError: {
              target: 'collect_birth_date',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  'A data informada está inválida ou no formato incorreto. Por favor, use **DD/MM/AAAA** (Ex: 01/01/2000).',
                ],
              })),
            },
          },
        },
        confirm_birth_date: {
          entry: assign(({ context: { responses, userInput } }) => ({
            responses: [
              ...responses,
              `Você informou a data de nascimento **${userInput}**. Está correto? (Sim/Não)`,
            ],
          })),
          on: {
            NO: {
              target: 'collect_birth_date',
              actions: assign(({ context: { responses } }) => ({
                responses: [
                  ...responses,
                  `Tudo bem! Por favor, digite sua Data de Nascimento novamente.`,
                ],
              })),
            },
            YES: {
              target: 'collect_cpf',
              actions: assign(
                ({ context: { responses, userInput, userInformation } }) => ({
                  userInformation: {
                    ...userInformation,
                    birthDate: userInput,
                  },
                  responses: [
                    ...responses,
                    `Data de Nascimento confirmada! Próximo: CPF.`,
                  ],
                  userInput: undefined,
                }),
              ),
            },
            USER_INPUT: {
              target: 'confirm_birth_date',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  `Por favor, responda com "Sim" ou "Não" para confirmar a data.`,
                ],
              })),
            },
          },
        },
        collect_cpf: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Agora, por favor, me informe o seu CPF (Cadastro de Pessoas Físicas). \n Você pode digitar apenas os 11 números, ou com pontos e traço (Ex: 123.456.789-00).',
            ],
            userInput: undefined,
          })),
          on: {
            USER_INPUT: {
              target: 'validate_cpf',
              actions: assign(({ event }) => ({
                userInput: event.value,
              })),
            },
          },
        },
        validate_cpf: {
          invoke: {
            src: 'validateCpf',
            input: ({ context: { userInput } }) => userInput,
            onDone: {
              target: 'confirm_cpf',
            },
            onError: {
              target: 'collect_cpf',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  'O CPF informado está **inválido** ou incompleto. Por favor, verifique e digite o CPF novamente (apenas 11 números).',
                ],
              })),
            },
          },
        },
        confirm_cpf: {
          entry: assign(({ context: { responses, userInput } }) => ({
            responses: [
              ...responses,
              `Você informou o CPF: **${userInput}**. Está correto? (Sim/Não)`,
            ],
          })),
          on: {
            NO: {
              target: 'collect_cpf',
              actions: assign(({ context: { responses } }) => ({
                responses: [
                  ...responses,
                  `Tudo bem! Por favor, digite seu CPF novamente.`,
                ],
              })),
            },
            YES: {
              target: 'collect_sex',
              actions: assign(
                ({ context: { responses, userInput, userInformation } }) => ({
                  userInformation: {
                    ...userInformation,
                    cpf: userInput.replace(/[^\d]/g, ''),
                  },
                  responses: [...responses, `CPF confirmado! Próximo: Sexo.`],
                  userInput: undefined,
                }),
              ),
            },
            USER_INPUT: {
              target: 'confirm_cpf',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  `Por favor, responda com "Sim" ou "Não" para confirmar o CPF.`,
                ],
              })),
            },
          },
        },
        collect_sex: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Quase lá! Agora, por favor, informe qual o seu **Sexo** de acordo com as opções abaixo:',
              '1) Feminino\n2) Masculino\n3) Outro\n4) Prefiro não especificar',
            ],
            userInput: undefined,
          })),
          on: {
            USER_INPUT: {
              target: 'validate_sex',
              actions: assign(({ event }) => ({
                userInput: event.value,
              })),
            },
          },
        },
        validate_sex: {
          invoke: {
            src: 'validateSexOption',
            input: ({ context: { userInput } }) => userInput,
            onDone: {
              target: 'menu',
              actions: assign(({ context, event }) => ({
                userInformation: {
                  ...context.userInformation,
                  sex: event.output,
                },
                responses: [
                  ...context.responses,
                  `Sexo registrado como **${event.output}**.`,
                ],
                userInput: undefined,
              })),
            },
            onError: {
              target: 'collect_sex',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  'Opção inválida. Por favor, digite o número (1, 2, 3 ou 4) ou o nome da opção desejada.',
                ],
              })),
            },
          },
        },
        menu: {
          on: {
            HEALTH_ISSUE_INFORM: 'health_issue_inform_flow',
            SCHEDULE_APPOINTMENT: 'schedule_appointment_flow',
            QUICK_GUIDANCE: 'quick_guidance_flow',
          },
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Ok! Dados coletados.',
              'Bem-vindo ao menu de serviços!',
              'Você gostaria de: \n 1) Informar um problema de saúde \n 2) Agendar ou confirmar uma consulta ou procedimento \n 3) Orientações rápidas',
            ],
          })),
        },
        health_issue_inform_flow: {
          on: {
            USER_INPUT: {
              target: 'health_issue_analysis',
              actions: assign({
                userInput: ({ event }) => event.value,
              }),
            },
          },
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              `Entendi!\nPara te ajudar melhor, preciso saber:\nQual o seu principal sintoma?\n(Febre, dor, tosse, falta de ar, outro...)`,
            ],
          })),
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
                guard: ({ event }) =>
                  event.output === 'health_issue_mild_symptoms',
                actions: assign({
                  userInput: undefined,
                }),
              },
              {
                target: 'health_issue_severe_symptoms',
                guard: ({ event }) =>
                  event.output === 'health_issue_severe_symptoms',
                actions: assign({
                  userInput: undefined,
                }),
              },
            ],
            onError: {
              target: 'error',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  'Erro ao analisar sintomas. Tente novamente.',
                ],
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
          after: {
            600: {
              target: 'still_need_help',
            },
          },
        },
        health_issue_severe_symptoms: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              `Seus sintomas indicam alerta! \nProcure o hospital mais perto de você para ser atendido prontamente!`,
            ],
          })),
          after: {
            600: {
              target: 'still_need_help',
            },
          },
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
            VERIFY: 'query_appointment',
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
              actions: assign({
                userInput: ({ event }) => event.value,
              }),
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
              actions: assign({
                response:
                  'Erro ao buscar as datas disponíveis. Tente novamente.',
              }),
            },
          },
        },
        list_appointment_options: {
          on: {
            USER_INPUT: {
              target: 'date_extraction',
              actions: assign({
                userInput: ({ event }) => event.value,
              }),
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
              userInput: userInput,
              availableDates: scheduledDateOptions,
            }),
            onDone: {
              target: 'try_schedule_appointment',
              actions: assign({
                chosenDate: ({ event }) => event.output.chosenDate,
              }),
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
            responses: [
              ...context.responses,
              'Verificando disponibilidade da vaga...',
            ],
          })),
          invoke: {
            src: 'scheduleAppointment',
            input: ({
              context: { typeOfAppointment, chosenDate, scheduledDateOptions },
            }) => ({ typeOfAppointment, chosenDate, scheduledDateOptions }),
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
              actions: assign(({ event, context }) => ({
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
            NO: 'still_need_help',
          },
        },
        query_appointment: {},
        quick_guidance_flow: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Ok! \nSelecione o tipo de orientação que você deseja: \n1) Vacinação \n2) Medidas de Higiene \n3) O que fazer em situações de emergência',
            ],
          })),
          on: {
            VACCINATION_FLOW: 'vaccination_flow',
            HYGIENE_MEASURES_FLOW: 'hygiene_measures_flow',
            URGENCY_SITUATION_FLOW: 'urgency_situation_flow',
          },
        },
        vaccination_flow: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Com base nos dados fornecidos...',
              'Sabe informar qual vacina precisa?',
            ],
          })),
          on: {
            YES: 'inform_vaccine',
            NO: 'check_user_or_other_person_vaccination',
          },
        },
        check_user_or_other_person_vaccination: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Ok! Antes de prosseguirmos, preciso saber: \nA vacinação é para você ou outra pessoa? \n1) Para mim\n2) Outra pessoa',
            ],
          })),
          on: {
            MYSELF: {
              target: 'overall_vaccine_guidance',
              actions: assign({
                userInput: ({ event }) => event.value,
              }),
            },
            OTHER_PERSON: {
              target: 'get_guests_birthdate',
            },
          },
        },
        get_guests_birthdate: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Entendi! Informe a data de nascimento da pessoa que você deseja consultar a vacinação',
            ],
          })),
          on: {
            USER_INPUT: {
              target: 'overall_vaccine_guidance',
              actions: assign({
                userInput: ({ event }) => event.value,
              }),
            },
          },
        },
        overall_vaccine_guidance: {
          invoke: {
            input: ({ context: { userInformation, userInput } }) =>
              userInformation.birthDate === ''
                ? userInformation.birthDate
                : userInput,
            src: 'askLlamaOnVaccineGuidance',
            onDone: {
              target: 'sus_check',
              actions: assign(({ event, context }) => ({
                responses: [
                  ...context.responses,
                  event.output.categoryResponse,
                  event.output.messageResponse,
                  event.output.vaccineListResponse,
                ],
              })),
            },
          },
        },
        inform_vaccine: {},
        hygiene_measures_flow: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Ok!\nVocê pode tirar dúvidas sobre higiene pessoal, higiene de alimentos ou sobre saneamento básico... \nQual seria a sua dúvida?',
            ],
          })),
          on: {
            USER_INPUT: {
              target: 'analyse_hygiene_doubt',
              actions: assign({
                userInput: ({ event }) => event.value,
              }),
            },
          },
        },
        analyse_hygiene_doubt: {
          entry: assign(({ context }) => ({
            responses: [...context.responses, 'Analisando sua dúvida...'],
          })),
          invoke: {
            input: ({ context: { userInput } }) => userInput,
            src: 'classifyAndRespondToHygieneMeasureDoubt',
            onDone: {
              target: 'sus_check',
              actions: assign(({ context, event }) => ({
                responses: [...context.responses, event.output],
              })),
            },
            onError: {
              target: 'error',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  'Desculpe, não conseguimos processar sua solicitação no momento. Voltando ao menu principal.',
                ],
              })),
            },
          },
        },
        urgency_situation_flow: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Ok! \nQue tipo de urgência você está enfrentando?',
            ],
          })),
          on: {
            USER_INPUT: {
              target: 'analyse_urgency_situation_matter',
              actions: assign({
                userInput: ({ event }) => event.value,
              }),
            },
          },
        },
        analyse_urgency_situation_matter: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Analisando a sua situação para te dar um melhor direcionamento...',
            ],
          })),
          invoke: {
            input: ({ context: { userInput } }) => userInput,
            src: 'classifyAndProvideGuidanceToUrgentSituation',
            onDone: {
              target: 'sus_check_urgency_cases',
              actions: assign(({ context, event }) => ({
                responses: [...context.responses, event.output],
              })),
            },
            onError: {
              target: 'error',
              actions: assign(({ context }) => ({
                responses: [
                  ...context.responses,
                  'Desculpe, não conseguimos processar sua solicitação no momento. Voltando ao menu principal.',
                ],
              })),
            },
          },
        },
        sus_check: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Para mais informações, acesse o aplicativo Meu SUS Digital',
              'Ou acesse o site: https://meususdigital.saude.gov.br/publico/conteudo',
            ],
          })),
          always: {
            target: 'redirect_appointment_schedule',
          },
        },
        sus_check_urgency_cases: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Se necessário, busque a UBS mais próxima de você para primeiros socorros',
              'Para mais informações em saúde no geral, acesse: https://meususdigital.saude.gov.br/publico/conteudo',
              'Ou acesse o aplicativo Meu SUS Digital',
            ],
          })),
          always: {
            target: 'redirect_appointment_schedule',
          },
        },
        redirect_appointment_schedule: {
          on: {
            YES: 'schedule_appointment_menu',
            NO: 'still_need_help',
          },
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              'Deseja agendar uma consulta na UBS para avaliação?',
            ],
          })),
        },
        still_need_help: {
          entry: assign(({ context }) => ({
            responses: [
              ...context.responses,
              `Há mais algo em que eu possa ajudar?`,
            ],
            response: `Há mais algo em que eu possa ajudar?`,
          })),
          on: {
            YES: 'menu',
            NO: 'end_session',
          },
        },
        error: {
          after: {
            500: {
              target: 'menu',
            },
          },
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
            responses: [
              ...context.responses,
              `Certo! Obrigada por usar o assistente virtual do SUS!`,
            ],
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
              if (!input) {
                throw new Error('Input inválido');
              }
              const prompt: ChatMessage[] = [
                {
                  role: 'system',
                  content:
                    'Analise os sintomas e classifique como leves ou graves. Retorne apenas: {"response": "Sua resposta", "nextState": "health_issue_mild_symptoms" ou "health_issue_severe_symptoms"}',
                },
                { role: 'user', content: input },
              ];

              const rawResponse = await groqService.askGroq(prompt);
              const parsed = JSON.parse(rawResponse) as {
                response: string;
                nextState: string;
              };
              return parsed.nextState;
            } catch (error) {
              return {
                response: 'Erro na análise. Tente novamente.',
                nextState: 'error',
              };
            }
          },
        ),
        mapAppointment: fromPromise(async ({ input }: { input: number }) => {
          try {
            let typeOfAppointment: string | null;
            const option = Number(input);
            switch (option) {
              case 1:
                typeOfAppointment = 'consulta_medica';
                break;
              case 2:
                typeOfAppointment = 'consulta_enfermagem';
                break;
              case 3:
                typeOfAppointment = 'consulta_emulti';
                break;
              case 4:
                typeOfAppointment = 'consulta_odontologica';
                break;
              case 5:
                typeOfAppointment = 'marcar_procedimento';
                break;
              default:
                typeOfAppointment = null;
                break;
            }

            if (typeOfAppointment === null) {
              throw new Error('Não foi possível identificar procedimento');
            }

            const today = new Date();

            const data1 = new Date(today);
            data1.setDate(today.getDate() + 5);

            const data2 = new Date(today);
            data2.setDate(today.getDate() + 10);

            const data3 = new Date(today);
            data3.setDate(today.getDate() + 15);

            const hour = new Date(today);
            hour.setHours(14, 0);

            const scheduleOptions = [
              {
                data: data1.toLocaleDateString(),
                hora: `${hour.getHours()}:${hour.getMinutes() < 10 ? `0${hour.getMinutes()}` : hour.getMinutes()}`,
              },
              {
                data: data2.toLocaleDateString(),
                hora: `${hour.getHours()}:${hour.getMinutes() < 10 ? `0${hour.getMinutes()}` : hour.getMinutes()}`,
              },
              {
                data: data3.toLocaleDateString(),
                hora: `${hour.getHours()}:${hour.getMinutes() < 10 ? `0${hour.getMinutes()}` : hour.getMinutes()}`,
              },
            ];

            const response =
              'Certo!\n\n Para essa modalidade temos: \n\n\n' +
              scheduleOptions
                .map((option) => `- ${option.data} às ${option.hora}`)
                .join('\n') +
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

            if (parsed.chosen_date === 'null') {
              throw new Error('Data não identificada ou inválida.');
            }

            return {
              chosenDate: parsed.chosen_date,
              chosenTime: parsed.chosen_time,
            };
          } catch (err) {
            throw new Error(err.message);
          }
        }),
        scheduleAppointment: fromPromise(async ({ input }: { input: any }) => {
          try {
            const selectedAppointment = input.scheduledDateOptions.find(
              (dateOption) => {
                return dateOption.data === input.chosenDate.trim();
              },
            );

            if (!selectedAppointment) {
              throw new Error('Data ou horário selecionado não disponível');
            }

            const isConfirmed = true;

            if (isConfirmed) {
              return {
                sucess: true,
                date: selectedAppointment.data,
                time: selectedAppointment.hora,
              };
            } else {
              throw new Error('Falha ao reservar o horário no sistema.');
            }
          } catch (err) {
            throw err;
          }
        }),
        askLlamaOnVaccineGuidance: fromPromise(
          async ({ input }: { input: string }) => {
            const data = vacinacao;
            const birthDate = new Date(input);
            const today = new Date();
            const age: string = JSON.stringify({
              anos: today.getFullYear() - birthDate.getFullYear(),
              meses: today.getMonth() - birthDate.getMonth(),
            });

            const prompt: ChatMessage[] = [
              {
                role: 'system',
                content: `O usuário busca saber quais são as vacinas que ele deve tomar.
                      Você deve analisar a idade do usuário (em anos) fornecida no input e classificá-lo em uma das 5 categorias: crianca (0-10), adolescente (11-19), adulto (20-59), gestante, idoso (60+). 
                      Se for o caso de gestante, o Groq Service deve retornar "gestante" independentemente da idade. Se não houver dados específicos de gestação, siga a regra de idade.
                      Retorne APENAS um objeto JSON no formato: {"category": "crianca"} ou {"category": "adolescente"} etc.`,
              },
              { role: 'user', content: age },
            ];

            const rawResponse = await groqService.askGroq(prompt);
            const parse = JSON.parse(rawResponse);
            const responseCategory = parse.category;

            const vaccinationData = data.find(
              (d) => d.category === responseCategory,
            );

            if (!vaccinationData) {
              throw new Error(
                `Dados de vacinação não encontrados para a categoria: ${responseCategory}`,
              );
            }

            const categoryMap: { [key: string]: string } = {
              crianca: 'Criança',
              adolescente: 'Adolescente',
              adulto: 'Adulto',
              gestante: 'Gestante',
              idoso: 'Idoso',
            };

            const category =
              categoryMap[vaccinationData.category] ||
              'Faixa Etária Não Identificada';

            const vaccinesList = vaccinationData.vaccines
              .map(
                (vaccine) =>
                  `- ${vaccine.name}: ${vaccine.description} - Doses: ${vaccine.dosage === 1 ? 'Dose Única' : vaccine.dosage}`,
              )
              .join('\n\n');

            return {
              categoryResponse:
                'Com base na idade, identificamos que a categoria que a pessoa se encaixa é classificada como ' +
                `*${category}*\n\n`,
              messageResponse: `${vaccinationData.message}\n\n`,
              vaccineListResponse: `Para essa categoria que a pessoa se encaixa, as vacinas recomendadas são: \n ${vaccinesList}`,
            };
          },
        ),
        classifyAndRespondToHygieneMeasureDoubt: fromPromise(
          async ({ input }: { input: string }) => {
            try {
              const prompt: ChatMessage[] = [
                {
                  role: 'system',
                  content: `Você é um especialista em medidas de higiene na saúde pública. Você receberá uma dúvida sobre medidas de higiene e deverá 
                classificar a dúvida dele em Higiene Pessoal (cuidados básicos que cada indivíduo deve ter), Higiene de Alimentos (Práticas relacionadas 
                ao manuseio, preparo e conservação dos alimentos para evitar contaminação e doenças transmitidas por eles) e Higiene Ambiental/Saneamento Básico 
                (Ações que envolvem o ambiente e a comunidade, muitas vezes coordenadas pelo poder público, onde o SUS tem um papel na articulação dessas políticas,
                ex: qualidade da água, esgotamento sanitário, manejo de resíduos sólidos, limpeza de ambientes). Em seguida, deve responder a essa dúvida de maneira 
                correta, adequada, de maneira clara e curta. 
                A dúvida que você vai receber, pode ser tradicionalmente respondida em Unidades Básicas de Saúde (UBS), com Agentes Comunitários
                de Saúde (ACS) ou com a Vigilância Sanitária. Você não pode responder o que não for verdade e o que não for informação conhecida do Ministério da Saúde.
                Você deve retornar um JSON com a estrutura {"category": "higiene_ambiental", "response": (resposta aqui)}, e as opções para "category" que você tem são:
                higiene_ambiental, higiene_pessoal e higiene_alimentos`,
                },
                { role: 'user', content: input },
              ];

              const rawResponse = await groqService.askGroq(prompt);
              let cleanResponse = rawResponse.replace(/[\n\r]/g, '');
              cleanResponse = cleanResponse.trim();

              const parsed = JSON.parse(cleanResponse);
              let botResponse = parsed.response;
              botResponse = botResponse.split(/(?<=[.:;])/);
              let response: string = '';

              botResponse.forEach((substring) => {
                response += substring + '\n';
              });

              return response;
            } catch (err) {
              throw err;
            }
          },
        ),
        classifyAndProvideGuidanceToUrgentSituation: fromPromise(
          async ({ input }: { input: string }) => {
            try {
              const prompt: ChatMessage[] = [
                {
                  role: 'system',
                  content: `
                  Você é um sistema de orientação de saúde em situações de urgência. Sua tarefa é analisar a situação de urgência descrita pelo usuário, classificá-la e fornecer uma resposta imediata. Lembre-se: você é um assistente, não um médico. Sua análise deve ser criteriosa, já que o objetivo é que se a pessoa puder resolver em casa, ela consiga resolver.

                  O seu retorno DEVE ser um objeto JSON no formato {"severity": "classificação", "response": "instruções"}.

                  Instruções para a classificação e resposta:

                  1. CLASSIFICAÇÃO (Severity): Classifique a gravidade em uma das três categorias:
                      - "domiciliar": A situação é leve e pode ser resolvida com medidas simples e seguras em casa.
                      - "encaminhamento_rapido": A situação é séria, mas a intervenção imediata em casa é crucial para estabilizar e a pessoa precisa de atendimento profissional breve (UPA ou Unidade de Saúde).
                      - "emergencia_imediata": A vida da pessoa está em risco iminente (exemplos: perda de consciência, dificuldade respiratória grave, convulsão, sangramento arterial incontrolável) ou outras situações em que o acionamento do SAMU (192) ou Corpo de Bombeiros (193) é a primeira e única ação recomendada.

                  2. RESPOSTA (Response):
                      - A resposta deve ser **curta, clara e segura**.
                      - NÃO forneça diagnósticos, apenas orientações de primeiros socorros e encaminhamento.
                      - Se a gravidade for "domiciliar": Forneça orientações concisas, seguras e facilmente aplicáveis para a resolução imediata em casa.
                      - Se a gravidade for "encaminhamento_rapido": Forneça **instruções imediatas e cruciais** para o momento (o que fazer e, principalmente, o que **NÃO** fazer para evitar piora) e oriente o usuário a procurar a **Unidade de Saúde mais próxima ou uma UPA** (Unidade de Pronto Atendimento).
                      - Se a gravidade for "emergencia_imediata": Forneça **instruções imediatas de primeiros socorros** que podem salvar a vida e oriente o usuário a ligar para o **SAMU (192) ou o Corpo de Bombeiros (193)**. É somente nesse tipo de situação que se recomenda procurar as duas instituições mencionadas.

                  SUA SAÍDA DEVE CONTER APENAS O OBJETO JSON.
                  `,
                },
                {
                  role: 'user',
                  content: input,
                },
              ];

              const rawResponse = await groqService.askGroq(prompt);
              const parsed = JSON.parse(rawResponse);
              const response = parsed.response;

              return response;
            } catch (err) {
              throw err;
            }
          },
        ),
        validateDate: fromPromise(async ({ input }: { input: string }) => {
          try {
            const dateString = input;
            const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;

            if (!regex.test(dateString)) {
              throw new Error('Formato inválido. Use DD/MM/AAAA.');
            }

            const parts = regex.exec(dateString) as RegExpExecArray;

            const day = parseInt(parts[1], 10);
            const month = parseInt(parts[2], 10);
            const year = parseInt(parts[3], 10);

            const dateObject = new Date();
            dateObject.setDate(day);
            dateObject.setMonth(month - 1);
            dateObject.setFullYear(year);

            const isDateValid =
              dateObject.getFullYear() === year &&
              dateObject.getMonth() === month - 1 &&
              dateObject.getDate() === day &&
              !isNaN(dateObject.getTime());

            if (!isDateValid) {
              throw new Error(`Data ${dateObject} inválida`);
            }

            const today = new Date();
            if (dateObject >= today) {
              throw new Error(`Data não pode ser uma data futura`);
            }

            return isDateValid;
          } catch (err) {
            throw err;
          }
        }),
        validateCpf: fromPromise(async ({ input }: { input: string }) => {
          const cpf = input.replace(/[^\d]/g, '');

          if (cpf.length !== 11) {
            throw new Error('CPF deve ter 11 dígitos');
          }

          if (/^(\d)\1{10}$/.test(cpf)) {
            throw new Error('CPF sequencial inválido.');
          }

          let sum = 0;
          let remainder = 0;

          for (let i = 1; i <= 9; i++)
            sum = sum + parseInt(cpf.substring(i - 1, i)) * (11 - i);
          remainder = (sum * 10) % 11;
          if (remainder === 10 || remainder === 11) remainder = 0;
          if (remainder !== parseInt(cpf.substring(9, 10))) {
            throw new Error('Primeiro dígito verificador inválido.');
          }

          sum = 0;
          for (let i = 1; i <= 10; i++)
            sum = sum + parseInt(cpf.substring(i - 1, i)) * (12 - i);
          remainder = (sum * 10) % 11;
          if (remainder === 10 || remainder === 11) remainder = 0;
          if (remainder !== parseInt(cpf.substring(10, 11))) {
            throw new Error('Segundo dígito verificador inválido.');
          }

          return remainder === 0;
        }),
        validateSexOption: fromPromise(async ({ input }: { input: number }) => {
          return new Promise((resolve, reject) => {
            const rawInput = String(input).trim().toLowerCase();
            let sexValue = '';

            if (rawInput === '1' || rawInput.includes('feminino')) {
              sexValue = 'Feminino';
            } else if (rawInput === '2' || rawInput.includes('masculino')) {
              sexValue = 'Masculino';
            } else if (rawInput === '3' || rawInput.includes('outro')) {
              sexValue = 'Outro';
            } else if (
              rawInput === '4' ||
              rawInput.includes('nao') ||
              rawInput.includes('não') ||
              rawInput.includes('nao especificar')
            ) {
              sexValue = 'Nao_especificado';
            }

            if (sexValue) {
              resolve(sexValue);
            } else {
              reject(new Error('Opção de sexo inválida.'));
            }
          });
        }),
      },
    },
  );