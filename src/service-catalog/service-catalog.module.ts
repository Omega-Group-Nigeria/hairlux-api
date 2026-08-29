import { Module, forwardRef } from '@nestjs/common';
import { ServiceCatalogService } from './service-catalog.service';
import { ServiceRecipeService } from './service-recipe.service';
import { ServiceCatalogController } from './service-catalog.controller';
import { AdminServiceCatalogController } from './admin-service-catalog.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { BranchModule } from '../branch/branch.module';

@Module({
  imports: [PrismaModule, CloudinaryModule, forwardRef(() => BranchModule)],
  controllers: [ServiceCatalogController, AdminServiceCatalogController],
  providers: [ServiceCatalogService, ServiceRecipeService],
  exports: [ServiceCatalogService, ServiceRecipeService],
})
export class ServiceCatalogModule { }