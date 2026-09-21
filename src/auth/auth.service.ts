import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { SignupDto, LoginDto, AuthResponseDto, ChangePasswordDto } from './dto/auth.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '@prisma/client';

// Roles a person can self-assign via the public signup screen. Field Agent,
// Admin and Super Admin accounts are never created this way — Field Agent
// and Admin are created by a Super Admin (see UsersController.createStaff),
// and Super Admin only via the seed script / direct DB access.
const PUBLIC_SIGNUP_ROLES: UserRole[] = [UserRole.OWNER, UserRole.RENTER];

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async signup(signupDto: SignupDto): Promise<AuthResponseDto> {
    if (signupDto.role && !PUBLIC_SIGNUP_ROLES.includes(signupDto.role)) {
      throw new BadRequestException(
        'This role cannot self-register. Please contact an administrator.',
      );
    }

    try {
      const user = await this.usersService.create({
        ...signupDto,
        role: signupDto.role ?? UserRole.RENTER,
      });
      const payload = {
        phone: user.phone,
        sub: user.id,
        role: user.role,
      };

      return {
        access_token: this.jwtService.sign(payload),
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
        },
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('Failed to create account');
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.validateUser(loginDto.phone, loginDto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Your account is currently inactive. Please contact the administrator for assistance.',
      );
    }

    const payload = {
      phone: user.phone,
      sub: user.id,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role as any,
      },
    };
  }

  async validateUser(phone: string, password: string): Promise<User | null> {
    return this.usersService.validateUser(phone, password);
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentPasswordValid = await this.usersService.validateUserPassword(
      user,
      changePasswordDto.currentPassword,
    );
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    await this.usersService.updatePassword(userId, changePasswordDto.newPassword);

    return { message: 'Password changed successfully' };
  }
}
