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
import { VisitsService } from './visits.service';
import { CreateVisitDto, AssignVisitDto, ConfirmVisitSlotDto, VisitOutcomeDto } from './dto/visit.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { VisitStatus } from '@prisma/client';

@Controller('visits')
@UseGuards(JwtAuthGuard)
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  // ---- RENTER ----

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.RENTER)
  async create(@Request() req, @Body() dto: CreateVisitDto) {
    return this.visitsService.create(req.user.userId, dto);
  }

  @Get('mine')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RENTER)
  async findMine(@Request() req) {
    return this.visitsService.findMineForRenter(req.user.userId);
  }

  @Patch(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RENTER)
  async cancel(@Request() req, @Param('id') id: string) {
    return this.visitsService.cancelByRenter(req.user.userId, id);
  }

  // ---- ADMIN / SUPER ADMIN ----

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async findAll(
    @Query('status') status?: VisitStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.visitsService.findAllForAdmin(status, Number(page) || 1, Number(limit) || 20);
  }

  @Patch(':id/assign')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async assign(@Param('id') id: string, @Body() dto: AssignVisitDto) {
    return this.visitsService.assign(id, dto);
  }

  // ---- FIELD AGENT (Admin/Super Admin may also act, e.g. reassigning) ----

  @Get('assigned')
  @UseGuards(RolesGuard)
  @Roles(UserRole.FIELD_AGENT)
  async findAssigned(@Request() req) {
    return this.visitsService.findAssignedForAgent(req.user.userId);
  }

  @Patch(':id/confirm-slot')
  @UseGuards(RolesGuard)
  @Roles(UserRole.FIELD_AGENT, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async confirmSlot(@Request() req, @Param('id') id: string, @Body() dto: ConfirmVisitSlotDto) {
    return this.visitsService.confirmSlot(
      { userId: req.user.userId, role: req.user.role },
      id,
      dto,
    );
  }

  @Patch(':id/outcome')
  @UseGuards(RolesGuard)
  @Roles(UserRole.FIELD_AGENT, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async setOutcome(@Request() req, @Param('id') id: string, @Body() dto: VisitOutcomeDto) {
    return this.visitsService.setOutcome(
      { userId: req.user.userId, role: req.user.role },
      id,
      dto,
    );
  }

  // ---- OWNER (read-only) ----

  @Get('owner')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  async findForOwner(
    @Request() req,
    @Query('status') status?: VisitStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.visitsService.findForOwner(
      req.user.userId,
      status,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  // ---- SHARED DETAIL ----
  // Placed last so it doesn't swallow the literal routes above ('mine',
  // 'owner', 'assigned' would otherwise match ':id').

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return this.visitsService.findOneForUser(id, {
      userId: req.user.userId,
      role: req.user.role,
    });
  }
}
