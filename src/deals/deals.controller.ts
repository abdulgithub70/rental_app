import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { DealsService } from './deals.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@Controller('deals')
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  // ---- OWNER ----

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  async create(@Request() req, @Body() dto: CreateDealDto) {
    return this.dealsService.create(req.user.userId, dto);
  }

  @Get('owner')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  async findForOwner(@Request() req) {
    return this.dealsService.findForOwner(req.user.userId);
  }

  // ---- RENTER ----

  @Get('mine')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RENTER)
  async findMine(@Request() req) {
    return this.dealsService.findMineForRenter(req.user.userId);
  }

  @Patch(':id/accept')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RENTER)
  async accept(@Request() req, @Param('id') id: string) {
    return this.dealsService.accept(req.user.userId, id);
  }

  @Patch(':id/decline')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RENTER)
  async decline(@Request() req, @Param('id') id: string) {
    return this.dealsService.decline(req.user.userId, id);
  }

  // ---- SHARED DETAIL (kept last so it doesn't swallow 'mine'/'owner') ----

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    return this.dealsService.findOneForUser(id, {
      userId: req.user.userId,
      role: req.user.role,
    });
  }
}
