import { IsString, IsNotEmpty, IsEnum, MinLength, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { UserRole } from '../enums/user-role.enum';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  // Field-agent only — which localities they cover (e.g. ["SHAHEEN_BAGH", "OKHLA"])
  @IsArray()
  @IsOptional()
  coverageLocalities?: string[];
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @IsArray()
  @IsOptional()
  coverageLocalities?: string[];
}

export class UserResponseDto {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  kycDocUrl?: string | null;
  coverageLocalities?: string[];
}

export class UpdateUserStatusDto {
  @IsBoolean()
  isActive: boolean;
}
