import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';
import { UserRole } from './enums/user-role.enum';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: createUserDto.phone },
    });

    if (existingUser) {
      throw new ConflictException('Phone number already registered');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(createUserDto.password, saltRounds);

    const createdUser = await this.prisma.user.create({
      data: {
        name: createUserDto.name,
        phone: createUserDto.phone,
        email: createUserDto.email,
        password: hashedPassword,
        role: (createUserDto.role as any) ?? UserRole.RENTER,
        coverageLocalities: (createUserDto.coverageLocalities as any) ?? [],
      },
    });

    return this.toResponseDto(createdUser);
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toResponseDto(user);
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    const data: any = { ...updateUserDto };

    if (updateUserDto.password) {
      const saltRounds = 10;
      data.password = await bcrypt.hash(updateUserDto.password, saltRounds);
    }

    if (updateUserDto.phone) {
      const existingUser = await this.prisma.user.findFirst({
        where: { phone: updateUserDto.phone, NOT: { id } },
      });

      if (existingUser) {
        throw new ConflictException('Phone number already registered');
      }
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id },
        data,
      });
      return this.toResponseDto(updatedUser);
    } catch {
      throw new NotFoundException('User not found');
    }
  }

  async validateUser(phone: string, password: string): Promise<User | null> {
    const user = await this.findByPhone(phone);

    if (!user) {
      return null;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    return passwordMatch ? user : null;
  }

  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async validateUserPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });
  }

  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany();
    return users.map((user) => this.toResponseDto(user));
  }

  async updateStatus(id: string, isActive: boolean): Promise<UserResponseDto> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: { isActive },
      });
      return this.toResponseDto(user);
    } catch {
      throw new NotFoundException('User not found');
    }
  }

  private toResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role as unknown as UserRole,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      kycDocUrl: user.kycDocUrl,
      coverageLocalities: user.coverageLocalities as unknown as string[],
    };
  }
}
