import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PropertiesModule } from './properties/properties.module';
import { TenanciesModule } from './tenancies/tenancies.module';
import { UploadsModule } from './uploads/uploads.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { GeocodingModule } from './common/geocoding/geocoding.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    // Kept registered for Phase 2 — powers cron jobs for rent-due and
    // agreement-expiry reminders once those are built.
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    PropertiesModule,
    TenanciesModule,
    UploadsModule,
    GeocodingModule,
  ],
})
export class AppModule {}
