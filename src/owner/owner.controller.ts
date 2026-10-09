import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { OwnerService } from './owner.service';
import { UpdateMaintenanceStatusDto, CreateMaintenanceRequestDto } from './dto/owner.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@Controller('owner')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class OwnerController {
  constructor(private readonly ownerService: OwnerService) {}

  @Get('dashboard')
  async getDashboard(@Request() req) {
    return this.ownerService.getDashboard(req.user.userId);
  }

  @Get('tenants')
  async getTenants(
    @Request() req,
    @Query('status') status?: 'ALL' | 'DUE' | 'OVERDUE',
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ownerService.getTenants(
      req.user.userId,
      status ?? 'ALL',
      search,
      Number(page) || 1,
      Number(limit) || 15,
    );
  }

  @Get('tenants/:tenancyId')
  async getTenantDetail(@Request() req, @Param('tenancyId') tenancyId: string) {
    return this.ownerService.getTenantDetail(req.user.userId, tenancyId);
  }

  @Get('tenants/:tenancyId/rent-ledger')
  async getRentLedger(
    @Request() req,
    @Param('tenancyId') tenancyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ownerService.getRentLedger(
      req.user.userId,
      tenancyId,
      Number(page) || 1,
      Number(limit) || 12,
    );
  }

  @Get('tenants/:tenancyId/utility-readings')
  async getUtilityReadings(
    @Request() req,
    @Param('tenancyId') tenancyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ownerService.getUtilityReadings(
      req.user.userId,
      tenancyId,
      Number(page) || 1,
      Number(limit) || 10,
    );
  }

  @Get('tenants/:tenancyId/maintenance')
  async getMaintenanceRequests(
    @Request() req,
    @Param('tenancyId') tenancyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ownerService.getMaintenanceRequests(
      req.user.userId,
      tenancyId,
      Number(page) || 1,
      Number(limit) || 10,
    );
  }

  @Post('tenants/:tenancyId/maintenance')
  async createMaintenanceRequest(
    @Request() req,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: CreateMaintenanceRequestDto,
  ) {
    return this.ownerService.createMaintenanceRequest(req.user.userId, tenancyId, dto);
  }

  @Patch('maintenance/:requestId')
  async updateMaintenanceStatus(
    @Request() req,
    @Param('requestId') requestId: string,
    @Body() dto: UpdateMaintenanceStatusDto,
  ) {
    return this.ownerService.updateMaintenanceStatus(req.user.userId, requestId, dto);
  }
}
