import { Controller, Post, Body, Get } from '@nestjs/common';
import { SendMessageDTO } from './dto/send-message.dto';
import { ChatService } from './chat.service';
import { ChatMessage } from './chat.types';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  getChat(): string {
    return 'Tudo ok!';
  }

  @Post()
  async sendMessage(@Body() dto: SendMessageDTO): Promise<{
    replies: string[];
    history: ChatMessage[];
  }> {
    try {
      const result = await this.chatService.handleMessage(dto);
      return result;
    } catch (error) {
      return { replies: ['Desculpe, houve um erro no servidor.'], history: [] };
    }
  }

  @Post('message')
  async sendMessageWithAgent(
    @Body() body: { agentId: number; message: string; history: ChatMessage[] },
  ): Promise<{
    replies: string[];
    history: ChatMessage[];
  }> {
    try {
      const result = await this.chatService.handleMessage({
        ...body,
        agentId: body.agentId,
      } as SendMessageDTO);
      return result;
    } catch (error) {
      return { replies: ['Desculpe, houve um erro no servidor.'], history: [] };
    }
  }
}