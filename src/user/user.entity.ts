import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  cpf: string;

  @Column()
  name: string;

  @Column({ name: 'social_name', nullable: true })
  socialName: string;

  @Column({ name: 'birth_date' })
  birthDate: string;

  @Column({ nullable: true })
  sex: string;

  @Column({ nullable: true })
  cep: string;

  @Column({ nullable: true })
  neighborhood: string;

  @Column({ nullable: true })
  street: string;

  @Column({ nullable: true })
  number: string;

  @Column({ default: false })
  hasSocialName: boolean;

  @Column({ default: false })
  hasHealthProfessionalName: boolean;

  @Column({ name: 'health_professional_name', nullable: true })
  healthProfessionalName: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}