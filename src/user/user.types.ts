export interface UserAddress {
  neighborhood: string;
  street: string;
  number: string;
  complement: string;
}

export interface User {
  cpf: string;
  name: string;
  socialName?: string;
  hasSocialName: boolean;
  birthDate: string;
  sex?: string;
  address?: UserAddress;
  hasHealthProfessionalName: boolean;
  healthProfessionalName?: string;
}