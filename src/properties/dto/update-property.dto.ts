import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AvailabilityStatus } from '@prisma/client';
import { CreatePropertyDto } from './create-property.dto';

// Owner can update any of the create fields later (e.g. change rent, add photos)
export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {
  @IsEnum(AvailabilityStatus)
  @IsOptional()
  availabilityStatus?: AvailabilityStatus;
}

// Used by Admin/Super Admin only — approve, reject, or ask for changes
export class VerifyPropertyDto {
  @IsEnum(['VERIFIED', 'REJECTED', 'CHANGES_REQUESTED'])
  decision: 'VERIFIED' | 'REJECTED' | 'CHANGES_REQUESTED';

  @IsString()
  @IsOptional()
  notes?: string;
}
