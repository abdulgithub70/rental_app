import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MaintenanceStatus } from '@prisma/client';

export class UpdateMaintenanceStatusDto {
  @IsEnum(MaintenanceStatus)
  status: MaintenanceStatus;

  @IsString()
  @IsOptional()
  note?: string;
}

export class CreateMaintenanceRequestDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;
}
