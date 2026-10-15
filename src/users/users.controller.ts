import { Controller, Get, Post, Body, Patch, Param, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto, UpdateUserStatusDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from './enums/user-role.enum';

// Roles a Super Admin is allowed to create via the "Add staff" endpoint below.
// Super Admin accounts are never created through the API — seed script /
// direct DB access only — to avoid one Super Admin being able to mint others
// through a compromised or buggy endpoint.
const STAFF_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.FIELD_AGENT];

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get('profile')
  async getProfile(@Request() req): Promise<UserResponseDto> {
    return this.usersService.findOne(req.user.userId);
  }

  @Patch('profile')
  async updateProfile(
    @Request() req,
    @Body() updateUserDto: UpdateUserDto
  ): Promise<UserResponseDto> {
    return this.usersService.update(req.user.userId, updateUserDto);
  }

  // Super Admin creates Admin / Field Agent accounts here — this is the only
  // way those two roles get created outside the seed script.
  @Post('staff')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async createStaff(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    if (!createUserDto.role || !STAFF_ROLES.includes(createUserDto.role)) {
      throw new BadRequestException('role must be one of: ADMIN, FIELD_AGENT');
    }
    return this.usersService.create(createUserDto);
  }

  //Get all registered users - SUPER ADMIN ONLY
  @Get('all')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async findAll(): Promise<UserResponseDto[]> {
    return this.usersService.findAll();
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateStatus(id, updateStatusDto.isActive);
  }

  // Field agents list for the Admin app (assigning visits).
  // Declared before ':id' so 'agents' isn't treated as a user id.
  @Get('agents')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async findFieldAgents() {
    return this.usersService.findFieldAgents();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

}