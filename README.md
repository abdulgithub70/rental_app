# Owner Rent & Tenant Management — NestJS module

    INTEGRATION.md                      read this first: wiring, schema contract, security
    owner-api.http                      runnable smoke test for every endpoint
    prisma/owner-additions.prisma       MaintenanceStatus enum + indexes to add
    src/owner/                          the new module
    src/tenancies/dto/                  DTOs for the two endpoints you already have

## Quick start

1. Copy `src/owner/` and `src/tenancies/dto/` into your `src/`.
2. Add `OwnerModule` to AppModule's imports.
3. Global ValidationPipe needs `transform: true`.
4. Add the enum + indexes from `prisma/owner-additions.prisma`, then migrate.
5. Apply `src/owner/EXISTING-ENDPOINTS-PATCH.md`.
6. `npm i @nestjs/schedule` and add `ScheduleModule.forRoot()` — or delete
   `src/owner/rent-ledger.cron.ts` and schedule it yourself.
7. Backfill once: `rentLedgerService.backfill(new Date('2026-01-01'))`.

## Where things live

    owner.constants.ts    every tunable rule: due day, expiry window, timezone, page size
    owner.select.ts       every Prisma field name this module reads — fix names here only
    rent.util.ts          rent status + agreement expiry (requirement 6)
    maintenance.util.ts   the status transition table
    owner-access.service.ts  ownership checks; exported for the tenancies module
    rent-ledger.service.ts   creates the monthly rows nothing else was creating

## Tests

    npx jest src/owner

28 cases over the two rule files. No Prisma mock needed — both are pure.
