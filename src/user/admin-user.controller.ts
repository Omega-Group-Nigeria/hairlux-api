import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
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
import { AssignAdminRoleDto } from './dto/assign-admin-role.dto';
import { InfluencerService } from '../influencer/influencer.service';
import { PromoteInfluencerDto } from '../influencer/dto/promote-influencer.dto';

@ApiTags('Admin - Users')
@ApiBearerAuth('JWT-auth')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminUserController {
  constructor(
    private readonly userService: UserService,
    private readonly influencerService: InfluencerService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create admin user',
    description:
      'Create a new admin account and assign a role immediately. Only accessible by Super Admin.',
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
          email: 'jane@hairlux.com',
          firstName: 'Jane',
          lastName: 'Doe',
          phone: '+2348012345678',
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          adminRoleId: 'b2f7e1a0-3c14-4f2b-9e8d-1a2b3c4d5e6f',
          adminRole: {
            id: 'b2f7e1a0-3c14-4f2b-9e8d-1a2b3c4d5e6f',
            name: 'Receptionist',
          },
          createdAt: '2026-03-03T10:00:00.000Z',
          updatedAt: '2026-03-03T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @ApiResponse({ status: 404, description: 'Admin role not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Super Admin only' })
  async createAdminUser(@Body() dto: CreateAdminUserDto) {
    const data = await this.userService.createAdminUser(dto);
    return {
      success: true,
      message: 'Admin user created successfully',
      data,
    };
  }

  @Patch(':id/role')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Reassign admin role',
    description:
      'Change the admin role assigned to an existing ADMIN user. Permissions update immediately (cache invalidated on next request).',
  })
  @ApiParam({ name: 'id', description: 'Admin user ID' })
  @ApiResponse({
    status: 200,
    description: 'Role reassigned successfully',
    schema: {
      example: {
        success: true,
        message: 'Admin role reassigned successfully',
        data: {
          id: 'uuid',
          email: 'jane@hairlux.com',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'ADMIN',
          adminRoleId: 'new-role-uuid',
          adminRole: { id: 'new-role-uuid', name: 'Senior Manager' },
          updatedAt: '2026-03-03T12:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'User or admin role not found' })
  @ApiResponse({ status: 400, description: 'User is not an ADMIN' })
  async assignRole(@Param('id') id: string, @Body() dto: AssignAdminRoleDto) {
    const data = await this.userService.assignAdminRole(id, dto.adminRoleId);
    return {
      success: true,
      message: 'Admin role reassigned successfully',
      data,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete admin user',
    description:
      'Permanently removes an ADMIN user. Cannot be used on SUPER_ADMIN or USER accounts.',
  })
  @ApiParam({ name: 'id', description: 'Admin user ID' })
  @ApiResponse({ status: 200, description: 'Admin user deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 400, description: 'User is not an ADMIN' })
  async deleteAdminUser(@Param('id') id: string) {
    await this.userService.deleteAdminUser(id);
    return {
      success: true,
      message: 'Admin user deleted successfully',
    };
  }

  @Get()
  @ApiOperation({
    summary: 'Get all users',
    description:
      'Retrieve users with optional filters for search, status, and role. ' +
      'Pass `role=USER` for customers, `role=ADMIN` for staff, `role=SUPER_ADMIN` for super admins. ' +
      'Omit `role` to fetch all. ' +
      'For users with role=ADMIN, the `role` field in the response is replaced with their admin role name (e.g. "CASHIER").',
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
          walletBalance: 5000,
          transactionCount: 3,
          _count: { bookings: 5, addresses: 2 },
        },
        {
          id: 'clx0987654321',
          email: 'admin@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '+2348098765432',
          role: 'CASHIER',
          status: 'ACTIVE',
          createdAt: '2026-02-01T14:20:00.000Z',
          updatedAt: '2026-02-10T09:15:00.000Z',
          walletBalance: 0,
          transactionCount: 0,
          _count: { bookings: 0, addresses: 0 },
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

  // ─── Search (must be declared before :id to prevent route shadowing) ─────

  @Get('search')
  @ApiOperation({
    summary: 'Search users by email',
    description:
      'Search for users by partial email match. Shows influencer status to help admin decide whether to promote.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        success: true,
        message: 'Users found',
        data: [
          {
            id: 'u1b2c3d4',
            email: 'amara@example.com',
            firstName: 'Amara',
            lastName: 'Okafor',
            phone: '+2348012345678',
            role: 'USER',
            status: 'ACTIVE',
            influencer: null,
          },
        ],
      },
    },
  })
  async searchUsers(@Query('email') email: string) {
    const data = await this.userService.searchByEmail(email ?? '');
    return { success: true, message: 'Users found', data };
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

  // ─── Influencer Management ────────────────────────────────────────────────

  @Post(':userId/make-influencer')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Promote user to influencer',
    description:
      'Links the user account as an influencer. If already an inactive influencer, they are re-activated.',
  })
  @ApiParam({ name: 'userId', description: 'User ID (UUID)' })
  @ApiResponse({
    status: 201,
    description: 'User promoted to influencer',
    schema: {
      example: {
        success: true,
        message: 'User promoted to influencer successfully',
        data: {
          id: 'inf-uuid',
          userId: 'u1b2c3d4',
          notes: null,
          isActive: true,
          user: {
            id: 'u1b2c3d4',
            firstName: 'Amara',
            lastName: 'Okafor',
            email: 'amara@example.com',
            phone: '+2348012345678',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({
    status: 409,
    description: 'User is already an active influencer',
  })
  async makeInfluencer(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: PromoteInfluencerDto,
  ) {
    const data = await this.influencerService.promoteUser(userId, dto);
    return {
      success: true,
      message: 'User promoted to influencer successfully',
      data,
    };
  }

  @Delete(':userId/remove-influencer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Demote user from influencer',
    description:
      'Deactivates the influencer record and all their discount codes. The user account and rewards are retained.',
  })
  @ApiParam({ name: 'userId', description: 'User ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Influencer demoted successfully' })
  @ApiResponse({ status: 404, description: 'User is not an influencer' })
  async removeInfluencer(@Param('userId', ParseUUIDPipe) userId: string) {
    await this.influencerService.demoteUser(userId);
    return { success: true, message: 'Influencer demoted successfully' };
  }
}
