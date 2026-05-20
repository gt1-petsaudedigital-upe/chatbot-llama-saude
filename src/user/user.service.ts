import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity';
import { User } from './user.types';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async findByCpf(cpf: string): Promise<User | undefined> {
    const clean = cpf.replace(/[^\d]/g, '');
    const entity = await this.userRepository.findOne({ where: { cpf: clean } });
    return entity ? this.toUser(entity) : undefined;
  }

  async findByName(name: string): Promise<User | undefined> {
    const entities = await this.userRepository.find();
    const entity = entities.find((u) =>
      u.name.toLowerCase().includes(name.toLowerCase()),
    );
    return entity ? this.toUser(entity) : undefined;
  }

  async findAll(): Promise<User[]> {
    const entities = await this.userRepository.find();
    return entities.map(this.toUser);
  }

  async create(user: User): Promise<User> {
    const clean = user.cpf.replace(/[^\d]/g, '');
    const existing = await this.userRepository.findOne({ where: { cpf: clean } });

    if (existing) {
      throw new ConflictException(`Usuário com CPF ${clean} já cadastrado.`);
    }

    const entity = this.userRepository.create({
      ...user,
      cpf: clean,
    });

    const saved = await this.userRepository.save(entity);
    this.logger.log(`New user created: ${saved.name} (CPF: ${saved.cpf})`);
    return this.toUser(saved);
  }

  async update(cpf: string, data: Partial<User>): Promise<User> {
  const clean = cpf.replace(/[^\d]/g, '');
  const entity = await this.userRepository.findOne({ where: { cpf: clean } });

  if (!entity) {
    throw new NotFoundException(`Usuário com CPF ${clean} não encontrado.`);
  }

  await this.userRepository.update(entity.id, data);
  const updated = await this.userRepository.findOne({ where: { cpf: clean } });
  
  if (!updated) {
    throw new NotFoundException(`Erro ao buscar usuário atualizado.`);
  }
  
  this.logger.log(`User updated: CPF ${clean}`);
  return this.toUser(updated);
}

  async delete(cpf: string): Promise<void> {
    const clean = cpf.replace(/[^\d]/g, '');
    const entity = await this.userRepository.findOne({ where: { cpf: clean } });

    if (!entity) {
      throw new NotFoundException(`Usuário com CPF ${clean} não encontrado.`);
    }

    await this.userRepository.delete(entity.id);
    this.logger.log(`User deleted: CPF ${clean}`);
  }

  // Método interno para o chatbot salvar usuário após coleta de dados
  async findOrCreate(user: Partial<User>): Promise<User> {
    const clean = user.cpf?.replace(/[^\d]/g, '');
    const existing = await this.userRepository.findOne({ where: { cpf: clean } });
    if (existing) return this.toUser(existing);

    const entity = this.userRepository.create({ ...user, cpf: clean });
    const saved = await this.userRepository.save(entity);
    return this.toUser(saved);
  }

  private toUser(entity: UserEntity): User {
    return {
      cpf: entity.cpf,
      name: entity.name,
      hasSocialName: entity.hasSocialName,
      socialName: entity.socialName,
      birthDate: entity.birthDate,
      sex: entity.sex,
      hasHealthProfessionalName: entity.hasHealthProfessionalName,
      healthProfessionalName: entity.healthProfessionalName,
      cep: entity.cep,
      neighborhood: entity.neighborhood,
      street: entity.street,
      number: entity.number,
    };
  }
}