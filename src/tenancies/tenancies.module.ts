import { Module } from '@nestjs/common';
import {
  TenanciesController,
  RentLedgerController,
  UtilityReadingsController,
} from './tenancies.controller';
import { TenanciesService } from './tenancies.service';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  controllers: [TenanciesController, RentLedgerController, UtilityReadingsController],
  providers: [TenanciesService, RolesGuard],
  exports: [TenanciesService],
})
export class TenanciesModule {}
