import { Injectable } from '@nestjs/common';
import { CreateBranchDto } from './dto/create-branch.dto';
import { PatchBranchServicesDto } from './dto/patch-branch-services.dto';
import { QueryAdminBranchesDto } from './dto/query-admin-branches.dto';
import { QueryBranchesDto } from './dto/query-branches.dto';
import { SetBranchServicesDto } from './dto/set-branch-services.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchCatalogService } from './services/branch-catalog.service';
import { BranchLocationService } from './services/branch-location.service';
import { BranchServiceConfigService } from './services/branch-service-config.service';

@Injectable()
export class BranchService {
  constructor(
    private readonly branchCatalogService: BranchCatalogService,
    private readonly branchLocationService: BranchLocationService,
    private readonly branchServiceConfigService: BranchServiceConfigService,
  ) {}

  listOpenBranches(queryDto: QueryBranchesDto) {
    return this.branchCatalogService.listOpenBranches(queryDto);
  }

  getOpenBranch(id: string) {
    return this.branchCatalogService.getOpenBranch(id);
  }

  createBranch(dto: CreateBranchDto) {
    return this.branchLocationService.create(dto);
  }

  findAllAdminBranches(queryDto: QueryAdminBranchesDto) {
    return this.branchLocationService.findAllAdmin(queryDto);
  }

  findOneAdminBranch(id: string) {
    return this.branchLocationService.findOneAdmin(id);
  }

  updateBranch(id: string, dto: UpdateBranchDto) {
    return this.branchLocationService.update(id, dto);
  }

  removeBranch(id: string) {
    return this.branchLocationService.remove(id);
  }

  getAdminServiceMatrix(branchId: string) {
    return this.branchServiceConfigService.getAdminMatrix(branchId);
  }

  setBranchServices(branchId: string, dto: SetBranchServicesDto) {
    return this.branchServiceConfigService.setAvailableServices(branchId, dto);
  }

  patchBranchServices(branchId: string, dto: PatchBranchServicesDto) {
    return this.branchServiceConfigService.patchServices(branchId, dto);
  }
}