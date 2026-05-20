import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { UserService } from './user.service';
import type { User } from './user.types';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async findAll(): Promise<User[]> {
    return this.userService.findAll();
  }

  @Get(':cpf')
  async findByCpf(@Param('cpf') cpf: string): Promise<User | { message: string }> {
    const user = await this.userService.findByCpf(cpf);
    if (!user) return { message: 'Usuário não encontrado.' };
    return user;
  }

  @Post()
  async create(@Body() user: User): Promise<User | { message: string }> {
    try {
      return await this.userService.create(user);
    } catch (error: any) {
      return { message: error.message };
    }
  }

  @Put(':cpf')
  async update(
    @Param('cpf') cpf: string,
    @Body() data: Partial<User>,
  ): Promise<User | { message: string }> {
    try {
      return await this.userService.update(cpf, data);
    } catch (error: any) {
      return { message: error.message };
    }
  }

  @Delete(':cpf')
  async delete(@Param('cpf') cpf: string): Promise<{ message: string }> {
    try {
      await this.userService.delete(cpf);
      return { message: 'Usuário removido com sucesso.' };
    } catch (error: any) {
      return { message: error.message };
    }
  }
}