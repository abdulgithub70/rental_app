import { IsDateString, IsEnum, IsNumber, IsOptional } from 'class-validator';
import { UtilityType } from '@prisma/client';

export class CreateUtilityReadingDto {
  @IsEnum(UtilityType)
  type: UtilityType;

  @IsDateString()
  readingDate: string;

  @IsNumber()
  @IsOptional()
  value?: number;

  @IsNumber()
  @IsOptional()
  billAmount?: number;
}
