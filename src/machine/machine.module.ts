import { Module } from '@nestjs/common';
import { MachineService } from './machine.service';
// import { GroqModule } from 'src/groq/groq.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [ UserModule],
  providers: [MachineService],
  exports: [MachineService],
})
export class MachineModule {}