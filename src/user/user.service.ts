import { Injectable, Logger } from '@nestjs/common';
import { User } from './user.types';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  
  private users: User[] = [
    {
      cpf: '12345678901',
      name: 'Maria Silva',
      hasSocialName: false,
      birthDate: '01/01/1990',
      sex: 'Feminino',
      hasHealthProfessionalName: false,
    },
    {
      cpf: '98765432100',
      name: 'João Santos',
      hasSocialName: false,
      birthDate: '15/06/1985',
      sex: 'Masculino',
      hasHealthProfessionalName: false,
    },
  ];

  
  findByCpf(cpf: string): User | undefined {
    const cleanCpf = cpf.replace(/[^\d]/g, '');
    return this.users.find((u) => u.cpf === cleanCpf);
  }

  
  findByName(name: string): User | undefined {
    return this.users.find((u) =>
      u.name.toLowerCase().includes(name.toLowerCase()),
    );
  }

  
  findAll(): User[] {
    return this.users;
  }

  
  create(user: User): User {
    const existing = this.findByCpf(user.cpf);
    if (existing) {
      throw new Error(`Usuário com CPF ${user.cpf} já cadastrado.`);
    }

    const newUser: User = {
      ...user,
      cpf: user.cpf.replace(/[^\d]/g, ''), 
    };

    this.users.push(newUser);
    this.logger.log(`New user created: ${newUser.name} (CPF: ${newUser.cpf})`);
    return newUser;
  }

  
  update(cpf: string, data: Partial<User>): User {
    const cleanCpf = cpf.replace(/[^\d]/g, '');
    const index = this.users.findIndex((u) => u.cpf === cleanCpf);

    if (index === -1) {
      throw new Error(`Usuário com CPF ${cleanCpf} não encontrado.`);
    }

    
    this.users[index] = { ...this.users[index], ...data };
    this.logger.log(`User updated: CPF ${cleanCpf}`);
    return this.users[index];
  }

  
  delete(cpf: string): void {
    const cleanCpf = cpf.replace(/[^\d]/g, '');
    const index = this.users.findIndex((u) => u.cpf === cleanCpf);

    if (index === -1) {
      throw new Error(`Usuário com CPF ${cleanCpf} não encontrado.`);
    }

    this.users.splice(index, 1);
    this.logger.log(`User deleted: CPF ${cleanCpf}`);
  }
}