import { Module } from '@nestjs/common';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  controllers: [VisitsController],
  providers: [VisitsService, RolesGuard],
  exports: [VisitsService],
})
export class VisitsModule {}
