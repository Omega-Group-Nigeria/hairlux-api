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
import { StaffModule } from 'src/staff/staff.module';

@Module({
  imports: [PrismaModule, RedisModule, StaffModule, forwardRef(() => ServiceCatalogModule)],
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