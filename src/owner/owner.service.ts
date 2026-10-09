import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { MaintenanceStatus, RentLedger } from '@prisma/client';
import { UpdateMaintenanceStatusDto, CreateMaintenanceRequestDto } from './dto/owner.dto';

type TenantFilter = 'ALL' | 'DUE' | 'OVERDUE';
type RentStatus = 'PAID' | 'PARTIALLY_PAID' | 'DUE' | 'OVERDUE' | 'NOT_GENERATED';
type ExpiryStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'NO_END_DATE';

const MONTH_LABEL = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
const MONTH_KEY = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

const MAINTENANCE_NEXT: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  OPEN: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: [],
};

@Injectable()
export class OwnerService {
  constructor(private prisma: PrismaService) {}

  // ---- DASHBOARD ----

  async getDashboard(ownerId: string) {
    const properties = await this.prisma.property.findMany({ where: { ownerId } });
    const now = startOfMonth(new Date());

    const totalProperties = properties.length;
    const availableProperties = properties.filter(p => p.availabilityStatus === 'AVAILABLE').length;
    const rentedProperties = properties.filter(p => p.availabilityStatus === 'RENTED').length;
    const pendingVerificationProperties = properties.filter(p =>
      ['PENDING_VERIFICATION', 'CHANGES_REQUESTED'].includes(p.verificationStatus),
    ).length;

    const activeTenancies = await this.prisma.tenancy.findMany({
      where: { status: 'ACTIVE', property: { ownerId } },
    });
    const activeTenants = activeTenancies.length;
    const monthlyExpectedRent = activeTenancies.reduce((sum, t) => sum + t.monthlyRent, 0);

    const currentMonthEntries = await this.prisma.rentLedger.findMany({
      where: { month: now, tenancy: { property: { ownerId } } },
    });
    const currentMonthCollectedRent = currentMonthEntries.reduce((sum, e) => sum + e.amountPaid, 0);
    const currentMonthOutstandingRent = currentMonthEntries.reduce(
      (sum, e) => sum + Math.max(0, e.amountDue - e.amountPaid),
      0,
    );

    return {
      totalProperties,
      availableProperties,
      rentedProperties,
      pendingVerificationProperties,
      activeTenants,
      monthlyExpectedRent,
      currentMonthCollectedRent,
      currentMonthOutstandingRent,
      currentMonth: MONTH_KEY(now),
    };
  }

  // ---- TENANTS LIST ----

  async getTenants(
    ownerId: string,
    filter: TenantFilter = 'ALL',
    search: string | undefined,
    page = 1,
    limit = 15,
  ) {
    const where: any = { status: 'ACTIVE', property: { ownerId } };
    if (search?.trim()) {
      where.OR = [
        { tenantName: { contains: search.trim(), mode: 'insensitive' } },
        { tenantPhone: { contains: search.trim(), mode: 'insensitive' } },
        { property: { address: { contains: search.trim(), mode: 'insensitive' } } },
      ];
    }

    const tenancies = await this.prisma.tenancy.findMany({
      where,
      include: { property: true },
      orderBy: { createdAt: 'desc' },
    });

    const ledgerByTenancy = await this.ledgerMapFor(tenancies.map(t => t.id));

    let items = tenancies.map(t =>
      this.toTenantListItem(t, t.property, ledgerByTenancy.get(t.id) ?? []),
    );

    if (filter === 'DUE') {
      items = items.filter(i => ['DUE', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.rent.status));
    } else if (filter === 'OVERDUE') {
      items = items.filter(i => i.rent.status === 'OVERDUE');
    }

    const total = items.length;
    const paged = items.slice((page - 1) * limit, page * limit);

    return { items: paged, total, page, limit, hasMore: page * limit < total };
  }

  async getTenantDetail(ownerId: string, tenancyId: string) {
    const tenancy = await this.prisma.tenancy.findUnique({
      where: { id: tenancyId },
      include: { property: true },
    });
    if (!tenancy) {
      throw new NotFoundException('Tenant record not found');
    }
    if (tenancy.property.ownerId !== ownerId) {
      throw new ForbiddenException('You can only view tenants on your own property');
    }

    const rentLedger = await this.prisma.rentLedger.findMany({ where: { tenancyId } });
    const openMaintenanceRequests = await this.prisma.maintenanceRequest.count({
      where: { tenancyId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
    });

    const property = tenancy.property;
    const expiry = this.agreementExpiry(tenancy.agreementExpiry);

    return {
      tenancyId: tenancy.id,
      status: tenancy.status,
      tenant: {
        id: tenancy.id, // no separate tenant User record in this MVP — see project notes
        name: tenancy.tenantName,
        phone: tenancy.tenantPhone,
        idProofUrl: tenancy.tenantIdProofUrl,
      },
      property: {
        id: property.id,
        locality: property.locality,
        address: property.address,
        type: property.type,
        floor: property.floor,
        sizeSqft: property.sizeSqft,
        monthlyRent: property.monthlyRent,
        securityDeposit: property.securityDeposit,
        photoUrls: property.photoUrls,
      },
      agreement: {
        startDate: tenancy.startDate,
        endDate: tenancy.endDate,
        agreementDocUrl: tenancy.agreementDocUrl,
        status: tenancy.status,
        expiry,
      },
      rent: this.rentSummary(rentLedger, tenancy.monthlyRent),
      counts: { openMaintenanceRequests },
    };
  }

  // ---- RENT LEDGER (paginated, per tenant) ----

  async getRentLedger(ownerId: string, tenancyId: string, page = 1, limit = 12) {
    await this.assertOwnsTenancy(ownerId, tenancyId);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.rentLedger.findMany({
        where: { tenancyId },
        orderBy: { month: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.rentLedger.count({ where: { tenancyId } }),
    ]);

    const now = startOfMonth(new Date());
    const items = rows.map(e => ({
      id: e.id,
      month: MONTH_KEY(e.month),
      monthLabel: MONTH_LABEL(e.month),
      amountDue: e.amountDue,
      amountPaid: e.amountPaid,
      outstanding: Math.max(0, e.amountDue - e.amountPaid),
      paidDate: e.paidDate,
      status: this.entryStatus(e, now),
    }));

    return { items, total, page, limit, hasMore: page * limit < total };
  }

  // ---- UTILITY READINGS (paginated, per tenant) ----

  async getUtilityReadings(ownerId: string, tenancyId: string, page = 1, limit = 10) {
    await this.assertOwnsTenancy(ownerId, tenancyId);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.utilityReading.findMany({
        where: { tenancyId },
        orderBy: { readingDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.utilityReading.count({ where: { tenancyId } }),
    ]);

    const items = rows.map(r => ({
      id: r.id,
      utilityType: r.type,
      readingDate: r.readingDate,
      value: r.value ?? 0,
      billAmount: r.billAmount,
    }));

    return { items, total, page, limit, hasMore: page * limit < total };
  }

  // ---- MAINTENANCE (paginated, per tenant) ----

  async getMaintenanceRequests(ownerId: string, tenancyId: string, page = 1, limit = 10) {
    await this.assertOwnsTenancy(ownerId, tenancyId);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.maintenanceRequest.findMany({
        where: { tenancyId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.maintenanceRequest.count({ where: { tenancyId } }),
    ]);

    const items = rows.map(r => this.toMaintenanceItem(r));
    return { items, total, page, limit, hasMore: page * limit < total };
  }

  async createMaintenanceRequest(
    ownerId: string,
    tenancyId: string,
    dto: CreateMaintenanceRequestDto,
  ) {
    const tenancy = await this.assertOwnsTenancy(ownerId, tenancyId);

    const created = await this.prisma.maintenanceRequest.create({
      data: {
        tenancyId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        raisedBy: tenancy.tenantName,
      },
    });

    return this.toMaintenanceItem(created);
  }

  async updateMaintenanceStatus(ownerId: string, requestId: string, dto: UpdateMaintenanceStatusDto) {
    const request = await this.prisma.maintenanceRequest.findUnique({
      where: { id: requestId },
      include: { tenancy: { include: { property: true } } },
    });
    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }
    if (request.tenancy.property.ownerId !== ownerId) {
      throw new ForbiddenException('You can only update maintenance requests on your own property');
    }

    const allowed = MAINTENANCE_NEXT[request.status];
    if (!allowed.includes(dto.status)) {
      throw new ForbiddenException(
        `Cannot move a ${request.status} request to ${dto.status}`,
      );
    }

    const updated = await this.prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        status: dto.status,
        resolvedDate: ['RESOLVED', 'REJECTED'].includes(dto.status) ? new Date() : undefined,
        description: dto.note
          ? `${request.description ?? ''}\n\n[Update] ${dto.note}`.trim()
          : request.description,
      },
    });

    return this.toMaintenanceItem(updated);
  }

  // ---- HELPERS ----

  private toMaintenanceItem(r: {
    id: string;
    title: string;
    description: string | null;
    status: MaintenanceStatus;
    createdAt: Date;
    resolvedDate: Date | null;
  }) {
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedDate,
      allowedNextStatuses: MAINTENANCE_NEXT[r.status],
    };
  }

  private async assertOwnsTenancy(ownerId: string, tenancyId: string) {
    const tenancy = await this.prisma.tenancy.findUnique({
      where: { id: tenancyId },
      include: { property: true },
    });
    if (!tenancy) {
      throw new NotFoundException('Tenant record not found');
    }
    if (tenancy.property.ownerId !== ownerId) {
      throw new ForbiddenException('You can only manage tenants on your own property');
    }
    return tenancy;
  }

  private async ledgerMapFor(tenancyIds: string[]): Promise<Map<string, RentLedger[]>> {
    if (tenancyIds.length === 0) return new Map();
    const rows = await this.prisma.rentLedger.findMany({
      where: { tenancyId: { in: tenancyIds } },
      orderBy: { month: 'asc' },
    });
    const map = new Map<string, RentLedger[]>();
    for (const row of rows) {
      const list = map.get(row.tenancyId) ?? [];
      list.push(row);
      map.set(row.tenancyId, list);
    }
    return map;
  }

  // The single most relevant entry to show for a tenant: the oldest unpaid
  // entry at or before this month (overdue takes priority), else this
  // month's entry if already paid, else "not billed yet".
  private rentSummary(ledger: RentLedger[], monthlyRent: number) {
    const now = startOfMonth(new Date());

    const unpaid = ledger
      .filter(e => e.month <= now && e.amountPaid < e.amountDue)
      .sort((a, b) => a.month.getTime() - b.month.getTime());

    if (unpaid.length > 0) {
      const e = unpaid[0];
      return {
        ledgerId: e.id,
        month: MONTH_KEY(e.month),
        monthLabel: MONTH_LABEL(e.month),
        amountDue: e.amountDue,
        amountPaid: e.amountPaid,
        outstanding: e.amountDue - e.amountPaid,
        status: this.entryStatus(e, now),
      };
    }

    const currentEntry = ledger.find(e => e.month.getTime() === now.getTime());
    if (currentEntry) {
      return {
        ledgerId: currentEntry.id,
        month: MONTH_KEY(currentEntry.month),
        monthLabel: MONTH_LABEL(currentEntry.month),
        amountDue: currentEntry.amountDue,
        amountPaid: currentEntry.amountPaid,
        outstanding: 0,
        status: 'PAID' as RentStatus,
      };
    }

    return {
      ledgerId: null,
      month: MONTH_KEY(now),
      monthLabel: MONTH_LABEL(now),
      amountDue: monthlyRent,
      amountPaid: 0,
      outstanding: 0,
      status: 'NOT_GENERATED' as RentStatus,
    };
  }

  private entryStatus(e: RentLedger, now: Date): RentStatus {
    if (e.amountPaid >= e.amountDue) return 'PAID';
    if (e.amountPaid > 0) return 'PARTIALLY_PAID';
    return e.month < now ? 'OVERDUE' : 'DUE';
  }

  private agreementExpiry(endDate: Date | null): {
    endDate: Date | null;
    daysUntilExpiry: number | null;
    status: ExpiryStatus;
  } {
    if (!endDate) {
      return { endDate: null, daysUntilExpiry: null, status: 'NO_END_DATE' };
    }
    const daysUntilExpiry = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const status: ExpiryStatus =
      daysUntilExpiry < 0 ? 'EXPIRED' : daysUntilExpiry <= 30 ? 'EXPIRING_SOON' : 'ACTIVE';
    return { endDate, daysUntilExpiry, status };
  }

  private toTenantListItem(
    tenancy: { id: string; tenantName: string; tenantPhone: string; monthlyRent: number; agreementExpiry: Date | null; startDate: Date },
    property: { id: string; locality: any; address: string; type: any; floor: string | null },
    ledger: RentLedger[],
  ) {
    return {
      tenancyId: tenancy.id,
      propertyId: property.id,
      tenantId: tenancy.id,
      tenantName: tenancy.tenantName,
      tenantPhone: tenancy.tenantPhone,
      locality: property.locality,
      address: property.address,
      type: property.type,
      floor: property.floor,
      monthlyRent: tenancy.monthlyRent,
      agreementStartDate: tenancy.startDate,
      agreementEndDate: tenancy.agreementExpiry,
      agreementExpiry: this.agreementExpiry(tenancy.agreementExpiry),
      rent: this.rentSummary(ledger, tenancy.monthlyRent),
    };
  }
}
