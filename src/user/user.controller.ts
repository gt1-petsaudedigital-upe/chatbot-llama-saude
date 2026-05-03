import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { UserService } from './user.service';
import type { User } from './user.types';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll(): User[] {
    return this.userService.findAll();
  }

  @Get(':cpf')
  findByCpf(@Param('cpf') cpf: string): User | { message: string } {
    const user = this.userService.findByCpf(cpf);
    if (!user) {
      return { message: 'Usuário não encontrado.' };
    }
    return user;
  }

  @Post()
  create(@Body() user: User): User | { message: string } {
    try {
      return this.userService.create(user);
    } catch (error: any) {
      return { message: error.message };
    }
  }

  @Put(':cpf')
  update(
    @Param('cpf') cpf: string,
    @Body() data: Partial<User>,
  ): User | { message: string } {
    try {
      return this.userService.update(cpf, data);
    } catch (error: any) {
      return { message: error.message };
    }
  }

  @Delete(':cpf')
  delete(@Param('cpf') cpf: string): { message: string } {
    try {
      this.userService.delete(cpf);
      return { message: 'Usuário removido com sucesso.' };
    } catch (error: any) {
      return { message: error.message };
    }
  }
}