import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { AdminBranchController } from './admin-branch.controller';
import { BranchController } from './branch.controller';
import { BranchService } from './branch.service';
import { BranchCatalogService } from './services/branch-catalog.service';
import { BranchLocationService } from './services/branch-location.service';
import { BranchServiceConfigService } from './services/branch-service-config.service';

@Module({
  imports: [PrismaModule, RedisModule, forwardRef(() => ServiceCatalogModule)],
  controllers: [BranchController, AdminBranchController],
  providers: [
    BranchService,
    BranchCatalogService,
    BranchLocationService,
    BranchServiceConfigService,
  ],
  exports: [BranchCatalogService, BranchService],
})
export class BranchModule {}