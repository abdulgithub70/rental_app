import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto, VerifyPropertyDto } from './dto/update-property.dto';
import { SearchPropertiesDto } from './dto/search-properties.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  // ---- OWNER ----

  // Add Property screen submits here — status starts as PENDING_VERIFICATION
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async create(@Request() req, @Body() dto: CreatePropertyDto) {
    return this.propertiesService.create(req.user.userId, dto);
  }

  // Owner dashboard — "My Properties" list
  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async findMine(@Request() req) {
    return this.propertiesService.findAllForOwner(req.user.userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdatePropertyDto) {
    return this.propertiesService.update(id, req.user.userId, dto);
  }

  // ---- RENTER (public — browsing needs no login; login is only required
  // to take an action, like requesting a visit, once that's built) ----

  // Search & Filters screen
  @Get('search')
  async search(@Query() dto: SearchPropertiesDto) {
    return this.propertiesService.search(dto);
  }

  // Property Detail screen
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  // ---- ADMIN / SUPER ADMIN ----

  // Verification Queue screen
  @Get('admin/queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async verificationQueue() {
    return this.propertiesService.findVerificationQueue();
  }

  @Patch(':id/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async verify(@Param('id') id: string, @Body() dto: VerifyPropertyDto) {
    return this.propertiesService.verify(id, dto);
  }
}
