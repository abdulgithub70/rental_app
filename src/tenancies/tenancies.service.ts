import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateTenancyDto } from './dto/create-tenancy.dto';
import { CreateRentLedgerDto, MarkRentPaidDto } from './dto/rent-ledger.dto';
import { CreateUtilityReadingDto } from './dto/utility-reading.dto';
import { RentStatus, Tenancy } from '@prisma/client';

@Injectable()
export class TenanciesService {
  constructor(private prisma: PrismaService) {}

  // ---- TENANCY ----

  async create(ownerId: string, dto: CreateTenancyDto): Promise<Tenancy> {
    const property = await this.prisma.property.findUnique({
      where: { id: dto.propertyId },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }
    if (property.ownerId !== ownerId) {
      throw new ForbiddenException('You can only add a tenancy to your own property');
    }
    if (property.availabilityStatus === 'RENTED') {
      throw new BadRequestException(
        'This property already has an active tenancy — end it first before adding a new one',
      );
    }

    const [tenancy] = await this.prisma.$transaction([
      this.prisma.tenancy.create({
        data: {
          propertyId: dto.propertyId,
          tenantName: dto.tenantName,
          tenantPhone: dto.tenantPhone,
          tenantIdProofUrl: dto.tenantIdProofUrl,
          startDate: new Date(dto.startDate),
          monthlyRent: dto.monthlyRent,
          depositPaid: dto.depositPaid,
          agreementDocUrl: dto.agreementDocUrl,
          agreementExpiry: dto.agreementExpiry ? new Date(dto.agreementExpiry) : undefined,
        },
      }),
      this.prisma.property.update({
        where: { id: dto.propertyId },
        data: { availabilityStatus: 'RENTED' },
      }),
    ]);

    return tenancy;
  }

  async getActiveForProperty(ownerId: string, propertyId: string): Promise<Tenancy | null> {
    await this.assertOwnsProperty(ownerId, propertyId);

    return this.prisma.tenancy.findFirst({
      where: { propertyId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(ownerId: string, tenancyId: string) {
    const tenancy = await this.prisma.tenancy.findUnique({
      where: { id: tenancyId },
      include: {
        property: true,
        rentLedger: { orderBy: { month: 'desc' } },
        utilityReadings: { orderBy: { readingDate: 'desc' } },
        maintenanceReqs: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!tenancy) {
      throw new NotFoundException('Tenancy not found');
    }
    if (tenancy.property.ownerId !== ownerId) {
      throw new ForbiddenException('You can only view tenancies on your own property');
    }

    return tenancy;
  }

  async end(ownerId: string, tenancyId: string): Promise<Tenancy> {
    const tenancy = await this.getOwnedTenancyOrThrow(ownerId, tenancyId);

    if (tenancy.status === 'ENDED') {
      throw new BadRequestException('This tenancy has already ended');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.tenancy.update({
        where: { id: tenancyId },
        data: { status: 'ENDED', endDate: new Date() },
      }),
      this.prisma.property.update({
        where: { id: tenancy.propertyId },
        data: { availabilityStatus: 'AVAILABLE' },
      }),
    ]);

    return updated;
  }

  // ---- RENT LEDGER ----

  async addRentLedgerEntry(ownerId: string, tenancyId: string, dto: CreateRentLedgerDto) {
    const tenancy = await this.getOwnedTenancyOrThrow(ownerId, tenancyId);

    // Normalize to the 1st of the month so [tenancyId, month] stays unique
    // regardless of which day within the month the owner picked.
    const monthDate = new Date(dto.month);
    const normalizedMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);

    try {
      return await this.prisma.rentLedger.create({
        data: {
          tenancyId,
          month: normalizedMonth,
          amountDue: dto.amountDue ?? tenancy.monthlyRent,
          status: 'DUE',
        },
      });
    } catch {
      throw new BadRequestException('A rent entry for this month already exists');
    }
  }

  async markRentPaid(ownerId: string, ledgerId: string, dto: MarkRentPaidDto) {
    const entry = await this.prisma.rentLedger.findUnique({
      where: { id: ledgerId },
      include: { tenancy: { include: { property: true } } },
    });

    if (!entry) {
      throw new NotFoundException('Rent ledger entry not found');
    }
    if (entry.tenancy.property.ownerId !== ownerId) {
      throw new ForbiddenException('You can only update rent entries on your own property');
    }

    const amountPaid = dto.amountPaid ?? entry.amountDue;
    const status: RentStatus = amountPaid >= entry.amountDue ? 'PAID' : 'DUE';

    return this.prisma.rentLedger.update({
      where: { id: ledgerId },
      data: {
        amountPaid,
        status,
        paidDate: dto.paidDate ? new Date(dto.paidDate) : new Date(),
      },
    });
  }

  // ---- UTILITY READINGS ----

  async addUtilityReading(ownerId: string, tenancyId: string, dto: CreateUtilityReadingDto) {
    await this.getOwnedTenancyOrThrow(ownerId, tenancyId);

    return this.prisma.utilityReading.create({
      data: {
        tenancyId,
        type: dto.type,
        readingDate: new Date(dto.readingDate),
        value: dto.value,
        billAmount: dto.billAmount,
      },
    });
  }

  // ---- HELPERS ----

  private async assertOwnsProperty(ownerId: string, propertyId: string) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    if (property.ownerId !== ownerId) {
      throw new ForbiddenException('You can only manage your own property');
    }
  }

  private async getOwnedTenancyOrThrow(ownerId: string, tenancyId: string): Promise<Tenancy> {
    const tenancy = await this.prisma.tenancy.findUnique({
      where: { id: tenancyId },
      include: { property: true },
    });

    if (!tenancy) {
      throw new NotFoundException('Tenancy not found');
    }
    if (tenancy.property.ownerId !== ownerId) {
      throw new ForbiddenException('You can only manage tenancies on your own property');
    }

    return tenancy;
  }
}
