import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class SendMessageDTO {
  @ApiProperty({ description: 'Mensagem do usuário' })
  @IsString()
  message: string;
  agentId?: number;

  @ApiPropertyOptional({
    description: 'ID da sessão. Se não informado, será gerado automaticamente.',
  })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
