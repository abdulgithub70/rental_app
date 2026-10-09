import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateDealDto } from './dto/create-deal.dto';

const PROPERTY_SELECT = {
  id: true,
  locality: true,
  address: true,
  type: true,
  monthlyRent: true,
  securityDeposit: true,
  photoUrls: true,
  ownerId: true,
  availabilityStatus: true,
};

const USER_SELECT = { id: true, name: true, phone: true };

const DEAL_INCLUDE = {
  property: { select: PROPERTY_SELECT },
  owner: { select: USER_SELECT },
  renter: { select: USER_SELECT },
};

@Injectable()
export class DealsService {
  constructor(private prisma: PrismaService) {}

  // ---- OWNER: extend an offer ----

  async create(ownerId: string, dto: CreateDealDto) {
    const property = await this.prisma.property.findUnique({ where: { id: dto.propertyId } });
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    if (property.ownerId !== ownerId) {
      throw new ForbiddenException('You can only offer your own property for rent');
    }
    if (property.verificationStatus !== 'VERIFIED' || property.availabilityStatus !== 'AVAILABLE') {
      throw new BadRequestException('This property is not currently available to offer');
    }

    const renter = await this.prisma.user.findUnique({ where: { id: dto.renterId } });
    if (!renter || renter.role !== 'RENTER') {
      throw new BadRequestException('renterId must belong to a Renter');
    }

    const existingOpenOffer = await this.prisma.deal.findFirst({
      where: { propertyId: dto.propertyId, renterId: dto.renterId, status: 'AGREEMENT' },
    });
    if (existingOpenOffer) {
      throw new BadRequestException('An offer is already pending for this renter on this property');
    }

    return this.prisma.deal.create({
      data: {
        propertyId: dto.propertyId,
        ownerId,
        renterId: dto.renterId,
        status: 'AGREEMENT',
        offeredMonthlyRent: dto.monthlyRent,
        offeredSecurityDeposit: dto.securityDeposit,
        offeredStartDate: new Date(dto.startDate),
        offerNotes: dto.notes,
      },
      include: DEAL_INCLUDE,
    });
  }

  async findForOwner(ownerId: string) {
    return this.prisma.deal.findMany({
      where: { ownerId },
      include: DEAL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- RENTER: review and respond ----

  async findMineForRenter(renterId: string) {
    return this.prisma.deal.findMany({
      where: { renterId },
      include: DEAL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneForUser(id: string, requester: { userId: string; role: string }) {
    const deal = await this.prisma.deal.findUnique({ where: { id }, include: DEAL_INCLUDE });
    if (!deal) {
      throw new NotFoundException('Offer not found');
    }

    const isPrivileged = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    if (deal.ownerId !== requester.userId && deal.renterId !== requester.userId && !isPrivileged) {
      throw new ForbiddenException('You do not have access to this offer');
    }

    return deal;
  }

  async accept(renterId: string, id: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id }, include: { property: true } });
    if (!deal) {
      throw new NotFoundException('Offer not found');
    }
    if (deal.renterId !== renterId) {
      throw new ForbiddenException('You can only accept your own offers');
    }
    if (deal.status !== 'AGREEMENT') {
      throw new BadRequestException('This offer is no longer open');
    }

    // Re-check under transaction to guard against a race with another
    // tenancy being created for the same property between the offer being
    // made and being accepted.
    return this.prisma.$transaction(async tx => {
      const property = await tx.property.findUnique({ where: { id: deal.propertyId } });
      if (!property || property.availabilityStatus !== 'AVAILABLE') {
        throw new BadRequestException(
          'This property is no longer available — it may already be rented',
        );
      }

      const renter = await tx.user.findUnique({ where: { id: renterId } });

      const tenancy = await tx.tenancy.create({
        data: {
          propertyId: deal.propertyId,
          tenantId: renterId,
          tenantName: renter!.name,
          tenantPhone: renter!.phone,
          startDate: deal.offeredStartDate ?? new Date(),
          monthlyRent: deal.offeredMonthlyRent ?? property.monthlyRent,
          depositPaid: deal.offeredSecurityDeposit ?? property.securityDeposit,
        },
      });

      await tx.property.update({
        where: { id: deal.propertyId },
        data: { availabilityStatus: 'RENTED' },
      });

      return tx.deal.update({
        where: { id },
        data: { status: 'CLOSED', tenancyId: tenancy.id, closedDate: new Date() },
        include: DEAL_INCLUDE,
      });
    });
  }

  async decline(renterId: string, id: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal) {
      throw new NotFoundException('Offer not found');
    }
    if (deal.renterId !== renterId) {
      throw new ForbiddenException('You can only decline your own offers');
    }
    if (deal.status !== 'AGREEMENT') {
      throw new BadRequestException('This offer is no longer open');
    }

    return this.prisma.deal.update({
      where: { id },
      data: { status: 'DROPPED' },
      include: DEAL_INCLUDE,
    });
  }
}
