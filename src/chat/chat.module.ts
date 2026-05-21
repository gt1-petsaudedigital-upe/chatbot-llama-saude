import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { GroqService } from 'src/groq/groq.service';
import { MachineService } from 'src/machine/machine.service';
import { UserModule } from 'src/user/user.module';
import { UserService } from 'src/user/user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/user/user.entity';

@Module({
  controllers: [ChatController],
  providers: [ChatService, GroqService, MachineService, UserService],
  imports: [UserModule, TypeOrmModule.forFeature([UserEntity])],
})
export class ChatModule {}