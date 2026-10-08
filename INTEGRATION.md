# Owner Rent & Tenant Management — integration guide

Two deliverables in this folder:

- `backend/` — a new NestJS `OwnerModule` plus a patch guide for the two
  endpoints that already exist.
- `mobile/` — the owner side of the React Native app, redesigned to the
  wireframe, wired to the new endpoints.

Nothing here changes the existing Property, Tenancy, RentLedger or
UtilityReading APIs. The Owner module is additive and namespaced under
`/api/v1/owner`.

---

## 1. Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/owner/dashboard` | portfolio counters + this month's rent position |
| GET | `/api/v1/owner/tenants` | active tenancies — `status=ALL\|DUE\|OVERDUE`, `search`, `page`, `limit` |
| GET | `/api/v1/owner/tenants/:tenancyId` | full tenant + property + agreement + rent detail |
| GET | `/api/v1/owner/tenants/:tenancyId/rent-ledger` | paginated ledger |
| GET | `/api/v1/owner/tenants/:tenancyId/utility-readings` | paginated readings, optional `utilityType` |
| GET | `/api/v1/owner/tenants/:tenancyId/maintenance` | paginated requests, optional `status` |
| PATCH | `/api/v1/owner/maintenance/:requestId` | update status, body `{ status, note? }` |

Two existing endpoints stay where they are and get an owner check —
see `backend/src/owner/EXISTING-ENDPOINTS-PATCH.md`:

- `PATCH /tenancies/:tenancyId/rent-ledger/:ledgerId/pay`
- `POST /tenancies/:tenancyId/utility-readings`

Every list response uses the same envelope:

```json
{ "items": [], "total": 0, "page": 1, "limit": 20, "hasMore": false }
```

## 2. Wiring it up

1. Copy `backend/src/owner/` into your `src/`.
2. Add `OwnerModule` to `AppModule`'s `imports`.
3. Confirm your global `ValidationPipe` has `transform: true` — the pagination
   DTOs rely on it to coerce `?page=2` into a number:

```ts
app.useGlobalPipes(
  new ValidationPipe({ transform: true, whitelist: true }),
);
```

4. Add the `MaintenanceStatus` enum and the indexes from
   `backend/prisma/owner-additions.prisma`, then run a migration. The
   `@@unique([tenancyId, month])` on RentLedger is not optional — the ledger
   generator relies on it to stay idempotent.
5. Apply the two patches in `EXISTING-ENDPOINTS-PATCH.md`. The DTOs they
   reference are in `backend/src/tenancies/dto/`.
6. Turn on scheduling for the rent ledger generator:

```bash
npm i @nestjs/schedule
```

```ts
// app.module.ts
imports: [ScheduleModule.forRoot(), OwnerModule, ...]
```

7. Backfill once, so existing tenancies have ledger history to show:

```ts
await rentLedgerService.backfill(new Date('2026-01-01'));
```

### Imports to check

`owner.controller.ts` imports these from your auth module. Rename the paths if
yours differ — the names are the only assumption:

```ts
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
```

`@CurrentUser()` is expected to return an object with `id`. If yours returns
`sub` or `userId`, change the `AuthUser` interface at the top of the controller
and the `user.id` reads.

### Schema contract

Every Prisma field this module reads is declared in
`backend/src/owner/owner.select.ts`. If a column is named differently in your
schema, fix it there and nothing else needs touching. Three fields are most
likely to be missing on a first-pass schema — delete the line if so:

- `User.idProofUrl` (tenant ID proof)
- `Tenancy.agreementDocUrl`
- `MaintenanceRequest.ownerNote` — only written when a `note` is sent with the
  PATCH; drop the `...(dto.note ? ...)` spread in `owner.service.ts` if you
  don't add the column.

Relation names assumed: `Tenancy.property`, `Tenancy.tenant`,
`RentLedger.tenancy`, `MaintenanceRequest.tenancy`.

`RentLedger.month` must be a `DateTime` pinned to the first of the month at UTC
midnight (`2026-09-01T00:00:00Z`). Lookups are equality matches on that value.
`rent.util.ts#startOfMonth` produces it — use the same helper when generating
ledger rows.

## 3. Security

Requirement 9, concretely:

- `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('OWNER')` sits on the
  controller class, so every route inherits it. No route can be added without it.
- Being an OWNER is not the same as owning *this* row. Every id in a path goes
  through `OwnerAccessService` before any read or write. The check is always a
  join back to `property.ownerId` — the app's `ownerId` is never read from the
  request.
- `assertOwnsRentLedgerEntry` checks the ledger row belongs to that tenancy
  *and* that tenancy belongs to the caller, so a valid `ledgerId` paired with
  someone else's `tenancyId` fails.
- Failures return **404, not 403**. A 403 would confirm the id exists and
  belongs to someone else, which is a free enumeration oracle.
- The tenant list's `where` clause starts with `property: { ownerId }`. Filters
  and search are added to it and can only narrow, never widen.
- `TENANT_SELECT` is an allow-list. Password hashes and internal fields can't
  leak through it by accident.

## 4. Business rules (server-side, per requirement 6)

All in `backend/src/owner/owner.constants.ts` and `rent.util.ts`:

| Rule | Where | Default |
|---|---|---|
| Rent due day | `RENT_DUE_DAY` | 5th |
| Agreement "expiring soon" window | `AGREEMENT_EXPIRY_WARNING_DAYS` | 60 days |
| Business timezone for month rollover | `APP_TZ_OFFSET_MINUTES` | 330 (IST) |
| Max page size | `MAX_PAGE_SIZE` | 50 |

**Rent status** is derived from amounts and dates, not from the stored enum —
so a ledger row that was paid but never had its `status` column updated still
reports `PAID`:

`PAID` → `PARTIALLY_PAID` → `DUE` → `OVERDUE` → `NOT_GENERATED` (no row billed yet).

**Agreement expiry** returns `{ endDate, daysUntilExpiry, status }` where status
is `ACTIVE` / `EXPIRING_SOON` / `EXPIRED` / `NO_END_DATE`. The app prints it and
never compares dates itself.

**Maintenance transitions** are in `maintenance.util.ts`:

```
OPEN        → IN_PROGRESS, RESOLVED, REJECTED
IN_PROGRESS → RESOLVED, REJECTED
RESOLVED    → (closed)
REJECTED    → (closed)
```

An illegal move returns 400 with the allowed list. Every maintenance response
also carries `allowedNextStatuses`, so the app draws the buttons the server
permits instead of hardcoding them.

## 5. Rent ledger generation

Requirement 3 assumes ledger rows exist, but nothing in the backend was
creating them. `rent-ledger.service.ts` fills that gap — without it every
tenancy reads `NOT_GENERATED` forever and the dashboard's outstanding total
sits at zero.

- `generateForMonth(month)` — one row per active tenancy that was live during
  that month and isn't already billed. Amount comes from `Tenancy.monthlyRent`,
  falling back to the property's.
- `markOverdue(now)` — ages unpaid rows so `status=OVERDUE` has something to
  filter on. Display status is still computed from amounts at read time, so
  this is an index convenience, not the source of truth.
- `runMonthlyCycle()` — both, in order. **Idempotent**: a retried cron, a
  manual re-run, or two instances starting at once all converge on the same
  result, guarded by `skipDuplicates` and the unique constraint.
- `backfill(from)` — bills every month from a date up to now, for an existing
  database.

`rent-ledger.cron.ts` schedules it: 00:30 IST on the 1st, plus a daily sweep at
01:00 that catches a tenancy which went active mid-month. It's the only file
that imports `@nestjs/schedule` — delete it and drop the provider if you'd
rather call `runMonthlyCycle()` from your own scheduler.

## 6. Performance (requirement 8)

- The tenant list is **two queries regardless of page size**: one paged query
  for the tenancies (tenant and property joined), one for this page's
  current-month ledger rows keyed by `tenancyId`. No per-card request, no N+1.
- `status=DUE|OVERDUE` resolves to a set of tenancy ids from the RentLedger side
  first, so the filter runs in SQL and pagination stays correct.
- The dashboard is three queries: one `groupBy` over properties, one over active
  tenancies, one `aggregate` over this month's ledger.
- List responses carry URLs only — `photoUrls`, `agreementDocUrl`, `idProofUrl`
  are never expanded, and the list endpoint omits photos entirely.
- Ledger, utilities and maintenance all paginate; defaults 20, max 50.

## 7. Mobile app

Files in `mobile/src/`, matching the paths in your existing project:

**Redesigned**
- `screens/owner/OwnerDashboardScreen.tsx` — greeting, four stat tiles, monthly
  rent card, property cards with photo and status
- `screens/owner/AddPropertyScreen.tsx` — grouped form sections, size and
  furnishing fields added, ownership document upload
- `screens/owner/OwnerPropertyDetailScreen.tsx` — the "coming soon" note is now
  a working route into rent tracking
- `theme/colors.ts` — new navy/ink tokens added; the old keys are untouched so
  renter, agent and admin screens render exactly as before
- `utils/propertyStatus.ts`, `types/property.ts`

**New**
- `screens/owner/OwnerTenantsScreen.tsx` — list, All/Due/Overdue filters,
  debounced search, infinite scroll
- `screens/owner/OwnerTenantDetailScreen.tsx` — hero, detail grid, ledger,
  utilities, maintenance
- `screens/owner/OwnerProfileScreen.tsx` — collection progress, portfolio
  counters, change password, log out
- `screens/owner/OwnerVisitsScreen.tsx` — placeholder for the fourth tab
- `components/OwnerTabBar.tsx`, `components/Badge.tsx`,
  `components/AddUtilityReadingModal.tsx`
- `services/owner.ts`, `types/rent.ts`, `utils/format.ts`
- `navigation/OwnerNavigator.tsx`

The tab bar is built on the existing native stack, so no new navigation package
is needed. Moving to `@react-navigation/bottom-tabs` later only touches
`OwnerTabBar.tsx` and `OwnerNavigator.tsx`.

### One thing to check on the backend

`AddPropertyScreen` now sends `ownershipDocUrl` with `POST /properties`. The
`Property` model already has the column; if `CreatePropertyDto` doesn't list it
and your `ValidationPipe` uses `whitelist: true` with `forbidNonWhitelisted`,
the request will 400. Add it to the DTO:

```ts
@IsOptional()
@IsString()
ownershipDocUrl?: string;
```

---

## 8. Tests

The rules requirement 6 says must live on the server are the ones worth
pinning down, and both are pure functions — no Prisma mock needed:

```bash
npx jest src/owner
```

- `rent.util.spec.ts` — 19 cases. Paid / part paid / due / overdue, the due-day
  boundary, unpaid past months, overpayment, agreement expiry at each edge
  (including exactly today), and the IST month rollover: 23:00 UTC on 30 Sep is
  already October to this code.
- `maintenance.util.spec.ts` — 9 cases. Every legal transition, the blocked
  backwards move, reopening a closed request, and `resolvedAt` being stamped
  once and never overwritten.

`backend/owner-api.http` is a runnable smoke test for every endpoint. Its last
block is the one to actually run before shipping — four requests that must
return **404** (another owner's tenancy, a foreign ledger row paired with your
own tenancyId, another owner's maintenance request), one that must return 403
(a renter's token on an owner route), and one that must return 400 (an illegal
status move).

## 9. What this does not cover

Out of scope for the brief, but worth knowing before you wire the app to a real
database:

- **Nothing creates a Tenancy.** The owner has no way to onboard a tenant,
  upload an agreement, or set start/end dates — so the tenant list stays empty
  until rows exist. This is the next endpoint to build.
- **Nothing creates a MaintenanceRequest.** The owner can move a request
  through its lifecycle; raising one is a renter-side action with no endpoint yet.
- **Visit scheduling** has no backend, so that tab is an honest placeholder
  rather than an empty list.
- **Notifications** — no reminder when rent falls due or an agreement is about
  to expire. `expiryStatus` and `OVERDUE` already give a scheduled job
  everything it needs to send one.
- **Partial payments** work in the API (`amountPaid` on the pay endpoint) but
  the app only offers "settle in full". Add an amount field to the confirm step
  when you need it.
