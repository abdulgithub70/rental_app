# Backend Setup Instructions

## Prerequisites
- Node.js 18+ installed
- A PostgreSQL database — Neon or Supabase free tier (see project chat for how to get the connection string)
- npm or yarn package manager

## Installation Steps

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```
```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public

JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

API_PREFIX=api/v1
```

### 3. Generate Prisma Client & Run Migrations
This creates all the tables (User, Property, Tenancy, RentLedger, etc.) in your Postgres database.
```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 4. Seed Test Users (optional but recommended)
Creates one test user per role — Super Admin, Admin, Field Agent, Owner, Renter (all with password `password123`).
```bash
npm run seed
```

### 5. Run the Server
```bash
npm run start:dev
```
Server runs on `http://localhost:3000/api/v1` by default.

## What's implemented so far
- **Auth**: signup / login / change-password, JWT-based, role-aware (`/api/v1/auth/*`)
- **Users**: profile, admin user list, activate/deactivate (`/api/v1/users/*`)
- **Properties**: Owner create/edit/list-mine, Renter search (with distance sort), Admin verification queue + approve/reject (`/api/v1/properties/*`)

## Still to build (next sessions)
- Tenancy, RentLedger, UtilityReading endpoints (Owner's Rent & Utility Tracking screen)
- VisitRequest endpoints (Renter's visit request + Admin's assignment screen)
- Deal endpoints (Admin's deal pipeline + commission tracking)
- MaintenanceRequest endpoints

## Useful Prisma commands
```bash
npx prisma studio       # visual DB browser in your local browser
npx prisma migrate dev  # apply schema changes as a new migration
```
