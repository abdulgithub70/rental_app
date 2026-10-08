import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, Min } from 'class-validator';

export class CreateTenancyDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsString()
  @IsNotEmpty()
  tenantName: string;

  @IsString()
  @IsNotEmpty()
  tenantPhone: string;

  @IsString()
  @IsOptional()
  tenantIdProofUrl?: string;

  @IsDateString()
  startDate: string;

  @IsNumber()
  @Min(0)
  monthlyRent: number;

  @IsNumber()
  @Min(0)
  depositPaid: number;

  @IsString()
  @IsOptional()
  agreementDocUrl?: string;

  @IsDateString()
  @IsOptional()
  agreementExpiry?: string;
}
