import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  controllers: [DealsController],
  providers: [DealsService, RolesGuard],
  exports: [DealsService],
})
export class DealsModule {}
