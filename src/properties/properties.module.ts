import { Module } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { PropertiesController } from './properties.controller';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  controllers: [PropertiesController],
  providers: [PropertiesService, RolesGuard],
  exports: [PropertiesService],
})
export class PropertiesModule {}
