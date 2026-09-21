import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto, VerifyPropertyDto } from './dto/update-property.dto';
import { SearchPropertiesDto } from './dto/search-properties.dto';
import { calculateDistanceMeters } from '../common/utils/distance.util';
import { VerificationStatus, Property } from '@prisma/client';

@Injectable()
export class PropertiesService {
  constructor(private prisma: PrismaService) {}

  // ---------- OWNER ----------

  async create(ownerId: string, dto: CreatePropertyDto): Promise<Property> {
    return this.prisma.property.create({
      data: {
        ...dto,
        ownerId,
        amenities: dto.amenities ?? [],
        photoUrls: dto.photoUrls ?? [],
        verificationStatus: VerificationStatus.PENDING_VERIFICATION,
      },
    });
  }

  async findAllForOwner(ownerId: string): Promise<Property[]> {
    return this.prisma.property.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, ownerId: string, dto: UpdatePropertyDto): Promise<Property> {
    const property = await this.getOrThrow(id);

    if (property.ownerId !== ownerId) {
      throw new ForbiddenException('You can only edit your own properties');
    }

    return this.prisma.property.update({
      where: { id },
      data: dto as any,
    });
  }

  // ---------- SHARED ----------

  async findOne(id: string): Promise<Property> {
    return this.getOrThrow(id);
  }

  private async getOrThrow(id: string): Promise<Property> {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    return property;
  }

  // ---------- RENTER SEARCH ----------

  async search(dto: SearchPropertiesDto): Promise<{
    properties: (Property & { distanceKm?: number })[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const where: any = {
      verificationStatus: VerificationStatus.VERIFIED,
      availabilityStatus: 'AVAILABLE',
    };

    if (dto.locality) where.locality = dto.locality;
    if (dto.type) where.type = dto.type;
    if (dto.preferredTenant) where.preferredTenant = dto.preferredTenant;
    if (dto.minRent || dto.maxRent) {
      where.monthlyRent = {};
      if (dto.minRent) where.monthlyRent.gte = dto.minRent;
      if (dto.maxRent) where.monthlyRent.lte = dto.maxRent;
    }
    if (dto.search) {
      where.address = { contains: dto.search, mode: 'insensitive' };
    }

    let properties = await this.prisma.property.findMany({ where });

    // Distance calculation/sort — same approach as the old mosque "nearby"
    // search: fetch matching rows, compute Haversine distance in JS, sort,
    // then paginate in memory. Fine at this scale (a few thousand rows).
    if (dto.latitude != null && dto.longitude != null) {
      const withDistance = properties
        .filter((p) => p.latitude != null && p.longitude != null)
        .map((p) => ({
          ...p,
          distanceKm:
            calculateDistanceMeters(dto.latitude!, dto.longitude!, p.latitude!, p.longitude!) / 1000,
        }));

      const filtered = dto.radius
        ? withDistance.filter((p) => p.distanceKm * 1000 <= dto.radius!)
        : withDistance;

      filtered.sort((a, b) => a.distanceKm - b.distanceKm);
      properties = filtered as any;
    }

    const total = properties.length;
    const paginated = properties.slice((page - 1) * limit, page * limit);

    return { properties: paginated, total, page, limit };
  }

  // ---------- ADMIN ----------

  async findVerificationQueue(): Promise<Property[]> {
    return this.prisma.property.findMany({
      where: {
        verificationStatus: {
          in: [VerificationStatus.PENDING_VERIFICATION, VerificationStatus.CHANGES_REQUESTED],
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async verify(id: string, dto: VerifyPropertyDto): Promise<Property> {
    await this.getOrThrow(id);

    return this.prisma.property.update({
      where: { id },
      data: {
        verificationStatus: dto.decision as VerificationStatus,
        verificationNotes: dto.notes,
      },
    });
  }
}
