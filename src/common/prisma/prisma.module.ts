import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() means every module in the app can inject PrismaService
// without listing PrismaModule in its own imports array.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
