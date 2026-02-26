import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AdminQueryUsersDto } from './dto/admin-query-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { GetTransactionsDto } from '../wallet/dto/get-transactions.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';

@ApiTags('Admin - Users')
@ApiBearerAuth('JWT-auth')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminUserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create admin user',
    description: 'Create a new admin account. Only accessible by Super Admin.',
  })
  @ApiResponse({
    status: 201,
    description: 'Admin user created successfully',
    schema: {
      example: {
        success: true,
        message: 'Admin user created successfully',
        data: {
          id: '123e4567-e89b-12d3-a456-426614174001',
          email: 'admin@hairlux.com',
          firstName: 'Admin',
          lastName: 'User',
          phone: '+2348012345678',
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          createdAt: '2026-02-22T10:00:00.000Z',
          updatedAt: '2026-02-22T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @ApiResponse({ status: 403, description: 'Forbidden - Super Admin only' })
  async createAdminUser(@Body() dto: CreateAdminUserDto) {
    const data = await this.userService.createAdminUser(dto);
    return {
      success: true,
      message: 'Admin user created successfully',
      data,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'Get all users',
    description:
      'Retrieve all users with optional filters for search and status, includes pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    example: {
      data: [
        {
          id: 'clx1234567890',
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+2348012345678',
          role: 'USER',
          status: 'ACTIVE',
          createdAt: '2026-01-15T10:30:00.000Z',
          updatedAt: '2026-02-17T10:30:00.000Z',
          _count: {
            bookings: 5,
            addresses: 2,
          },
        },
        {
          id: 'clx0987654321',
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '+2348098765432',
          role: 'USER',
          status: 'ACTIVE',
          createdAt: '2026-02-01T14:20:00.000Z',
          updatedAt: '2026-02-10T09:15:00.000Z',
          _count: {
            bookings: 3,
            addresses: 1,
          },
        },
      ],
      meta: {
        total: 50,
        page: 1,
        limit: 20,
        totalPages: 3,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getAllUsers(@Query() queryDto: AdminQueryUsersDto) {
    return this.userService.findAllUsers(queryDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get user details',
    description:
      'Get comprehensive user information including profile, wallet balance, booking history, addresses, and recent transactions',
  })
  @ApiResponse({
    status: 200,
    description: 'User details retrieved successfully',
    example: {
      user: {
        id: 'clx1234567890',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+2348012345678',
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
        createdAt: '2026-01-15T10:30:00.000Z',
        updatedAt: '2026-02-17T10:30:00.000Z',
      },
      wallet: {
        id: 'clx1111111111',
        balance: 25000,
        createdAt: '2026-01-15T10:30:00.000Z',
        updatedAt: '2026-02-17T10:30:00.000Z',
      },
      bookings: [
        {
          id: 'clx2222222222',
          bookingDate: '2026-02-20T00:00:00.000Z',
          bookingTime: '10:00',
          status: 'CONFIRMED',
          totalAmount: 15000,
          paymentMethod: 'WALLET',
          createdAt: '2026-02-17T10:30:00.000Z',
          service: {
            id: 'clx3333333333',
            name: 'Premium Hair Treatment',
            price: 15000,
          },
        },
      ],
      addresses: [
        {
          id: 'clx4444444444',
          label: 'Home',
          addressLine: '123 Main Street',
          city: 'Lagos',
          state: 'Lagos',
          country: 'Nigeria',
          isDefault: true,
          createdAt: '2026-01-15T10:30:00.000Z',
        },
      ],
      transactions: [
        {
          id: 'clx5555555555',
          type: 'DEPOSIT',
          amount: 50000,
          status: 'COMPLETED',
          description: 'Wallet deposit via Paystack',
          createdAt: '2026-02-15T14:20:00.000Z',
        },
        {
          id: 'clx6666666666',
          type: 'DEBIT',
          amount: 15000,
          status: 'COMPLETED',
          description: 'Payment for booking #clx2222222222',
          createdAt: '2026-02-17T10:30:00.000Z',
        },
      ],
      stats: {
        totalBookings: 5,
        totalAddresses: 2,
        walletBalance: 25000,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getUserDetails(@Param('id') id: string) {
    return this.userService.findUserDetailsAdmin(id);
  }

  @Get(':id/transactions')
  @ApiOperation({
    summary: 'Get user transactions',
    description:
      'Retrieve paginated wallet transaction history for a specific user. Filterable by type and status.',
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
            id: 'clx5555555555',
            type: 'DEPOSIT',
            amount: 50000,
            status: 'COMPLETED',
            reference: 'WALLET-1234567890-abc',
            description: 'Wallet deposit of ₦50000',
            createdAt: '2026-02-15T14:20:00.000Z',
          },
        ],
        pagination: { page: 1, limit: 20, total: 10, totalPages: 1 },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'User or wallet not found' })
  async getUserTransactions(
    @Param('id') id: string,
    @Query() query: GetTransactionsDto,
  ) {
    const data = await this.userService.adminGetUserTransactions(id, query);
    return {
      success: true,
      message: 'Transactions retrieved successfully',
      data,
    };
  }

  @Put(':id/status')
  @ApiOperation({
    summary: 'Update user status',
    description:
      'Activate or deactivate a user account. Deactivated users cannot log in or access their account.',
  })
  @ApiResponse({
    status: 200,
    description: 'User status updated successfully',
    example: {
      id: 'clx1234567890',
      email: 'john@example.com',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+2348012345678',
      role: 'USER',
      status: 'INACTIVE',
      createdAt: '2026-01-15T10:30:00.000Z',
      updatedAt: '2026-02-17T12:45:00.000Z',
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async updateUserStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateUserStatusDto,
  ) {
    return this.userService.updateUserStatus(id, updateStatusDto.status);
  }
}
