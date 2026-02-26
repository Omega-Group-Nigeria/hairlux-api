import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AdminQueryTransactionsDto } from './dto/admin-query-transactions.dto';

@ApiTags('Admin - Wallets')
@ApiBearerAuth('JWT-auth')
@Controller('admin/wallets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminWalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Get wallet statistics',
    description:
      'Aggregate stats across all wallets: total balance, average, highest balance, and transaction breakdown by type with failed/pending counts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet statistics retrieved successfully',
    example: {
      success: true,
      message: 'Wallet statistics retrieved successfully',
      data: {
        totalWallets: 120,
        totalBalance: 5000000,
        averageBalance: 41667,
        highestBalance: 500000,
        transactions: {
          byType: {
            DEPOSIT: { totalAmount: 8000000, count: 250 },
            DEBIT: { totalAmount: 3000000, count: 180 },
            REFUND: { totalAmount: 200000, count: 15 },
          },
          failed: 8,
          pending: 3,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getStats() {
    const data = await this.walletService.adminGetWalletStats();
    return {
      success: true,
      message: 'Wallet statistics retrieved successfully',
      data,
    };
  }

  @Get('transactions')
  @ApiOperation({
    summary: 'List all transactions',
    description:
      'Retrieve all transactions across all wallets. Filterable by type, status, userId, and date range.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
    example: {
      success: true,
      message: 'Transactions retrieved successfully',
      data: {
        transactions: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            type: 'DEPOSIT',
            amount: 5000,
            status: 'COMPLETED',
            reference: 'WALLET-1234567890-xxx',
            description: 'Wallet deposit of ₦5000',
            paystackReference: 'ps_ref_xxx',
            createdAt: '2026-02-17T10:00:00.000Z',
            updatedAt: '2026-02-17T10:00:00.000Z',
            wallet: {
              id: '123e4567-e89b-12d3-a456-426614174001',
              userId: '123e4567-e89b-12d3-a456-426614174002',
              user: {
                id: '123e4567-e89b-12d3-a456-426614174002',
                email: 'john@example.com',
                firstName: 'John',
                lastName: 'Doe',
              },
            },
          },
        ],
        pagination: { page: 1, limit: 20, total: 150, totalPages: 8 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getAllTransactions(@Query() query: AdminQueryTransactionsDto) {
    const data = await this.walletService.adminGetAllTransactions(query);
    return {
      success: true,
      message: 'Transactions retrieved successfully',
      data,
    };
  }
}
