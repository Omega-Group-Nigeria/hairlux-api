import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FinancialTransactionCategory, FinancialTransactionDirection } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Permission } from '../auth/decorators/permission.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { FinancialTransactionService } from './financial-transaction.service';

/**
 * Exposes FinancialTransactionService's existing record/query engine
 * (built in Phase 3, wired into ProductSale/SalonBooking/Wallet as an
 * internal dependency) as its own directly-queryable admin API -- the
 * one piece that was missing for the ledger to be viewable on its own,
 * not just a side effect of other modules.
 */
@ApiTags('Admin - Financial Transactions')
@ApiBearerAuth('JWT-auth')
@Controller('admin/financial-transactions')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
export class AdminFinancialTransactionController {
    constructor(private readonly financialTransactionService: FinancialTransactionService) { }

    @Get()
    @Permission(PERMISSIONS.FINANCIAL_TRANSACTIONS_READ)
    @ApiOperation({ summary: 'List financial transactions, filterable by direction/category/branch/date range' })
    @ApiQuery({ name: 'direction', required: false, enum: FinancialTransactionDirection })
    @ApiQuery({ name: 'category', required: false, enum: FinancialTransactionCategory })
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'from', required: false, description: 'ISO date string' })
    @ApiQuery({ name: 'to', required: false, description: 'ISO date string' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    async findAll(
        @Query('direction') direction?: FinancialTransactionDirection,
        @Query('category') category?: FinancialTransactionCategory,
        @Query('branchId') branchId?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('page') page?: string,
    ) {
        const data = await this.financialTransactionService.findAll(
            {
                direction,
                category,
                branchId,
                from: from ? new Date(from) : undefined,
                to: to ? new Date(to) : undefined,
            },
            page ? Number(page) : 1,
        );
        return { success: true, message: 'Retrieved successfully', data };
    }

    @Get('summary')
    @Permission(PERMISSIONS.FINANCIAL_TRANSACTIONS_READ)
    @ApiOperation({ summary: 'Total inflow, total outflow, net cash flow, and a breakdown by category -- reads straight from the ledger, never recomputed or estimated per-module' })
    @ApiQuery({ name: 'branchId', required: false })
    @ApiQuery({ name: 'from', required: false, description: 'ISO date string' })
    @ApiQuery({ name: 'to', required: false, description: 'ISO date string' })
    async getSummary(
        @Query('branchId') branchId?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        const data = await this.financialTransactionService.getSummary({
            branchId,
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
        });
        return { success: true, message: 'Retrieved successfully', data };
    }
}