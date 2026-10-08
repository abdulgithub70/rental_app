import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { TenanciesService } from './tenancies.service';
import { CreateTenancyDto } from './dto/create-tenancy.dto';
import { CreateRentLedgerDto, MarkRentPaidDto } from './dto/rent-ledger.dto';
import { CreateUtilityReadingDto } from './dto/utility-reading.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

// Everything here is Owner-only for now — a tenant has no login in this
// MVP (see project notes), so rent/utility tracking is entered manually by
// the Owner from the Rent & Utility Tracking screen.
@Controller('tenancies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class TenanciesController {
  constructor(private readonly tenanciesService: TenanciesService) {}

  // Called when the Owner marks a property as rented — sets the property's
  // availabilityStatus to RENTED and creates the Tenancy record.
  @Post()
  async create(@Request() req, @Body() dto: CreateTenancyDto) {
    return this.tenanciesService.create(req.user.userId, dto);
  }

  // Used by the Property Detail screen to check whether a RENTED property
  // has an active tenancy to show/link to.
  @Get('property/:propertyId')
  async getActiveForProperty(@Request() req, @Param('propertyId') propertyId: string) {
    return this.tenanciesService.getActiveForProperty(req.user.userId, propertyId);
  }

  // Rent & Utility Tracking screen — full detail with ledger + readings.
  @Get(':id')
  async getById(@Request() req, @Param('id') id: string) {
    return this.tenanciesService.getById(req.user.userId, id);
  }

  // Tenant moved out — property becomes AVAILABLE again, ready for the next tenancy.
  @Patch(':id/end')
  async end(@Request() req, @Param('id') id: string) {
    return this.tenanciesService.end(req.user.userId, id);
  }
}

@Controller('tenancies/:tenancyId/rent-ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class RentLedgerController {
  constructor(private readonly tenanciesService: TenanciesService) {}

  @Post()
  async addEntry(
    @Request() req,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: CreateRentLedgerDto,
  ) {
    return this.tenanciesService.addRentLedgerEntry(req.user.userId, tenancyId, dto);
  }

  @Patch(':ledgerId/pay')
  async markPaid(
    @Request() req,
    @Param('ledgerId') ledgerId: string,
    @Body() dto: MarkRentPaidDto,
  ) {
    return this.tenanciesService.markRentPaid(req.user.userId, ledgerId, dto);
  }
}

@Controller('tenancies/:tenancyId/utility-readings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class UtilityReadingsController {
  constructor(private readonly tenanciesService: TenanciesService) {}

  @Post()
  async addReading(
    @Request() req,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: CreateUtilityReadingDto,
  ) {
    return this.tenanciesService.addUtilityReading(req.user.userId, tenancyId, dto);
  }
}
