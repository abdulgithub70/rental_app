import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { VisitStatus } from '@prisma/client';

export class CreateVisitDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsDateString()
  requestedSlot: string;
}

export class AssignVisitDto {
  @IsString()
  @IsNotEmpty()
  agentId: string;

  // If given, the visit goes straight to CONFIRMED; otherwise it's
  // AGENT_ASSIGNED until the agent (or admin) confirms a slot separately.
  @IsDateString()
  @IsOptional()
  confirmedSlot?: string;
}

export class ConfirmVisitSlotDto {
  @IsDateString()
  confirmedSlot: string;
}

export class VisitOutcomeDto {
  @IsEnum(['COMPLETED', 'CANCELLED'])
  status: Extract<VisitStatus, 'COMPLETED' | 'CANCELLED'>;

  @IsString()
  @IsOptional()
  outcomeNotes?: string;
}

export class VisitQueryDto {
  @IsEnum(VisitStatus)
  @IsOptional()
  status?: VisitStatus;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
