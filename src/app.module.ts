import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ChatModule,
    UserModule,
  ],
})
export class AppModule {}