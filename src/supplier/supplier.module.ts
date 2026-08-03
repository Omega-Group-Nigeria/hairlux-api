import { Module } from '@nestjs/common';
import { SupplierController } from './supplier.controller';
import { StaffSupplierController } from './staff-supplier.controller';
import { SupplierService } from './supplier.service';

@Module({
    controllers: [SupplierController, StaffSupplierController],
    providers: [SupplierService],
    exports: [SupplierService],
})
export class SupplierModule { }