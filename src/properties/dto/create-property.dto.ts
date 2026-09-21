import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
} from 'class-validator';
import { Locality, PropertyType, PreferredTenant } from '@prisma/client';

export class CreatePropertyDto {
  @IsEnum(Locality)
  locality: Locality;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsEnum(PropertyType)
  type: PropertyType;

  @IsString()
  @IsOptional()
  floor?: string;

  @IsNumber()
  @IsOptional()
  sizeSqft?: number;

  @IsString()
  @IsOptional()
  furnishing?: string;

  @IsNumber()
  @Min(0)
  monthlyRent: number;

  @IsNumber()
  @Min(0)
  securityDeposit: number;

  @IsEnum(PreferredTenant)
  @IsOptional()
  preferredTenant?: PreferredTenant;

  @IsArray()
  @IsOptional()
  amenities?: string[];

  @IsArray()
  @IsOptional()
  photoUrls?: string[];

  @IsString()
  @IsOptional()
  ownershipDocUrl?: string;
}
