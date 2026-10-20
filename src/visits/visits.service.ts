import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateVisitDto, AssignVisitDto, ConfirmVisitSlotDto, VisitOutcomeDto } from './dto/visit.dto';
import { VisitStatus } from '@prisma/client';

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

// A visit can only be cancelled or reassigned before it's already finished.
const ACTIVE_STATUSES: VisitStatus[] = ['REQUESTED', 'AGENT_ASSIGNED', 'CONFIRMED'];

@Injectable()
export class VisitsService {
  constructor(private prisma: PrismaService) {}

  // ---- RENTER ----

  async create(renterId: string, dto: CreateVisitDto) {
    const property = await this.prisma.property.findUnique({ where: { id: dto.propertyId } });
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    if (property.verificationStatus !== 'VERIFIED' || property.availabilityStatus !== 'AVAILABLE') {
      throw new BadRequestException('This property is not currently available for visits');
    }

    return this.prisma.visitRequest.create({
      data: {
        propertyId: dto.propertyId,
        renterId,
        requestedSlot: new Date(dto.requestedSlot),
        status: 'REQUESTED',
      },
      include: { property: { select: PROPERTY_SELECT } },
    });
  }

  async findMineForRenter(renterId: string) {
    return this.prisma.visitRequest.findMany({
      where: { renterId },
      include: {
        property: { select: PROPERTY_SELECT },
        assignedAgent: { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelByRenter(renterId: string, id: string) {
    const visit = await this.getOrThrow(id);
    if (visit.renterId !== renterId) {
      throw new ForbiddenException('You can only cancel your own visit requests');
    }
    if (!ACTIVE_STATUSES.includes(visit.status)) {
      throw new BadRequestException('This visit can no longer be cancelled');
    }

    return this.prisma.visitRequest.update({
      where: { id },
      data: { status: 'CANCELLED', outcomeNotes: 'Cancelled by renter' },
      include: { property: { select: PROPERTY_SELECT }, assignedAgent: { select: USER_SELECT } },
    });
  }

  // ---- SHARED DETAIL (authorization varies by caller) ----

  async findOneForUser(id: string, requester: { userId: string; role: string }) {
    const visit = await this.prisma.visitRequest.findUnique({
      where: { id },
      include: {
        property: { select: PROPERTY_SELECT },
        renter: { select: USER_SELECT },
        assignedAgent: { select: USER_SELECT },
      },
    });
    if (!visit) {
      throw new NotFoundException('Visit request not found');
    }

    const isOwnerOfProperty = visit.property.ownerId === requester.userId;
    const isRenterOfVisit = visit.renterId === requester.userId;
    const isAssignedAgent = visit.assignedAgentId === requester.userId;
    const isPrivileged = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);

    if (!isRenterOfVisit && !isOwnerOfProperty && !isAssignedAgent && !isPrivileged) {
      throw new ForbiddenException('You do not have access to this visit request');
    }

    return visit;
  }

  // ---- ADMIN / SUPER ADMIN ----

  async findAllForAdmin(status: VisitStatus | undefined, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.visitRequest.findMany({
        where,
        include: {
          property: { select: PROPERTY_SELECT },
          renter: { select: USER_SELECT },
          assignedAgent: { select: USER_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.visitRequest.count({ where }),
    ]);

    return { items, total, page, limit, hasMore: page * limit < total };
  }

  async assign(id: string, dto: AssignVisitDto) {
    const visit = await this.getOrThrow(id);
    if (!ACTIVE_STATUSES.includes(visit.status)) {
      throw new BadRequestException('This visit is already finished');
    }

    const agent = await this.prisma.user.findUnique({ where: { id: dto.agentId } });
    if (!agent || agent.role !== 'FIELD_AGENT') {
      throw new BadRequestException('agentId must belong to a Field Agent');
    }

    return this.prisma.visitRequest.update({
      where: { id },
      data: {
        assignedAgentId: dto.agentId,
        confirmedSlot: dto.confirmedSlot ? new Date(dto.confirmedSlot) : undefined,
        status: dto.confirmedSlot ? 'CONFIRMED' : 'AGENT_ASSIGNED',
      },
      include: {
        property: { select: PROPERTY_SELECT },
        renter: { select: USER_SELECT },
        assignedAgent: { select: USER_SELECT },
      },
    });
  }

  // ---- FIELD AGENT (or Admin/Super Admin acting on their behalf) ----

  async findAssignedForAgent(agentId: string) {
    return this.prisma.visitRequest.findMany({
      where: { assignedAgentId: agentId, status: { in: ['AGENT_ASSIGNED', 'CONFIRMED'] } },
      include: { property: { select: PROPERTY_SELECT }, renter: { select: USER_SELECT } },
      orderBy: { requestedSlot: 'asc' },
    });
  }

  async confirmSlot(actor: { userId: string; role: string }, id: string, dto: ConfirmVisitSlotDto) {
    const visit = await this.getOrThrow(id);
    this.assertAgentOrPrivileged(actor, visit.assignedAgentId);
    if (visit.status !== 'AGENT_ASSIGNED') {
      throw new BadRequestException('Only an assigned visit awaiting confirmation can be confirmed');
    }

    return this.prisma.visitRequest.update({
      where: { id },
      data: { confirmedSlot: new Date(dto.confirmedSlot), status: 'CONFIRMED' },
      include: { property: { select: PROPERTY_SELECT }, renter: { select: USER_SELECT } },
    });
  }

  async setOutcome(actor: { userId: string; role: string }, id: string, dto: VisitOutcomeDto) {
    const visit = await this.getOrThrow(id);
    this.assertAgentOrPrivileged(actor, visit.assignedAgentId);
    if (!ACTIVE_STATUSES.includes(visit.status)) {
      throw new BadRequestException('This visit is already finished');
    }

    return this.prisma.visitRequest.update({
      where: { id },
      data: { status: dto.status, outcomeNotes: dto.outcomeNotes },
      include: { property: { select: PROPERTY_SELECT }, renter: { select: USER_SELECT } },
    });
  }

  // ---- OWNER (read-only) ----

  async findForOwner(ownerId: string, status: VisitStatus | undefined, page = 1, limit = 20) {
    const where = {
      property: { ownerId },
      ...(status ? { status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.visitRequest.findMany({
        where,
        include: {
          property: { select: PROPERTY_SELECT },
          renter: { select: USER_SELECT },
          assignedAgent: { select: USER_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.visitRequest.count({ where }),
    ]);

    return { items, total, page, limit, hasMore: page * limit < total };
  }

  // ---- HELPERS ----

  private async getOrThrow(id: string) {
    const visit = await this.prisma.visitRequest.findUnique({ where: { id } });
    if (!visit) {
      throw new NotFoundException('Visit request not found');
    }
    return visit;
  }

  private assertAgentOrPrivileged(actor: { userId: string; role: string }, assignedAgentId: string | null) {
    const isPrivileged = ['ADMIN', 'SUPER_ADMIN'].includes(actor.role);
    if (!isPrivileged && actor.userId !== assignedAgentId) {
      throw new ForbiddenException('You can only act on visits assigned to you');
    }
  }
}
