import { Module } from '@nestjs/common';
import { OwnerController } from './owner.controller';
import { OwnerService } from './owner.service';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  controllers: [OwnerController],
  providers: [OwnerService, RolesGuard],
  exports: [OwnerService],
})
export class OwnerModule {}
