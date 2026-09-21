import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Locality, PropertyType, PreferredTenant } from '@prisma/client';

// Query params for the Renter "Search & Filters" screen.
// If latitude/longitude are given, results are sorted by distance and each
// result gets a "distanceKm" field (using the Haversine util) — same pattern
// the old mosque search used for "nearby mosques".
export class SearchPropertiesDto {
  @IsEnum(Locality)
  @IsOptional()
  locality?: Locality;

  @IsEnum(PropertyType)
  @IsOptional()
  type?: PropertyType;

  @IsEnum(PreferredTenant)
  @IsOptional()
  preferredTenant?: PreferredTenant;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  minRent?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  maxRent?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  longitude?: number;

  // search radius in meters, only used when lat/lng are given
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  radius?: number;

  @IsString()
  @IsOptional()
  search?: string; // free-text match against address

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  limit?: number;
}
