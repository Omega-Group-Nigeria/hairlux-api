import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { SupplierController } from './supplier.controller';
import { StaffSupplierController } from './staff-supplier.controller';
import { AdminVendorLedgerController } from './admin-vendor-ledger.controller';
import { SupplierService } from './supplier.service';
import { VendorLedgerService } from './vendor-ledger.service';

@Module({
    imports: [StaffModule],
    controllers: [SupplierController, StaffSupplierController, AdminVendorLedgerController],
    providers: [SupplierService, VendorLedgerService],
    exports: [SupplierService, VendorLedgerService],
})
export class SupplierModule { }