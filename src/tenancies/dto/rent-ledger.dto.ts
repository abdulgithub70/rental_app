import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateRentLedgerDto {
  // Any date within the target month works — the service normalizes it to
  // the 1st of that month before saving.
  @IsDateString()
  month: string;

  // Optional — defaults to the tenancy's monthlyRent if not given.
  @IsNumber()
  @Min(0)
  @IsOptional()
  amountDue?: number;
}

export class MarkRentPaidDto {
  // Optional — defaults to the entry's full amountDue (a full payment).
  // Pass a smaller number to record a partial payment.
  @IsNumber()
  @Min(0)
  @IsOptional()
  amountPaid?: number;

  @IsDateString()
  @IsOptional()
  paidDate?: string;
}
