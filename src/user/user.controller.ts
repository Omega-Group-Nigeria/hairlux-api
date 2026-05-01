import {
  Controller,
  Get,
  Patch,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UsePipes,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { ResponseUtil } from '../common/utils/response.util';
import { AddressValidationPipe } from './pipes/address-validation.pipe';

const addressValidationPipe = new AddressValidationPipe();

@ApiTags('User Management')
@ApiBearerAuth('JWT-auth')
@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    example: {
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'jane@hairlux.com',
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+2348012345678',
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
        adminRoleId: 'b2f7e1a0-3c14-4f2b-9e8d-1a2b3c4d5e6f',
        adminRole: {
          id: 'b2f7e1a0-3c14-4f2b-9e8d-1a2b3c4d5e6f',
          name: 'Receptionist',
        },
        permissions: ['bookings:read', 'users:read'],
        createdAt: '2026-01-25T12:00:00.000Z',
        updatedAt: '2026-01-25T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(
    @GetUser('id') userId: string,
    @GetUser('permissions') permissions: string[],
  ) {
    const user = await this.userService.getProfile(userId);
    return ResponseUtil.success(
      { ...user, permissions },
      'Profile retrieved successfully',
    );
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    example: {
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'john.doe@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+2348098765432',
        role: 'USER',
        status: 'ACTIVE',
        updatedAt: '2026-01-25T13:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateProfile(
    @GetUser('id') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const user = await this.userService.updateProfile(userId, updateProfileDto);
    return ResponseUtil.success(user, 'Profile updated successfully');
  }

  @Put('password')
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
    example: {
      success: true,
      message: 'Password changed successfully',
      data: {
        message: 'Password changed successfully',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  async changePassword(
    @GetUser('id') userId: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const result = await this.userService.changePassword(
      userId,
      changePasswordDto,
    );
    return ResponseUtil.success(result, result.message);
  }

  @Get('addresses')
  @ApiOperation({ summary: 'Get all user addresses' })
  @ApiResponse({
    status: 200,
    description: 'Addresses fetched successfully',
    example: {
      success: true,
      message: 'Addresses fetched successfully',
      data: [
        {
          id: '660e8400-e29b-41d4-a716-446655440000',
          label: 'Home',
          fullAddress: '12 Admiralty Way, Lekki Phase 1, Lagos, Nigeria',
          streetAddress: '12 Admiralty Way',
          city: 'Lagos',
          state: 'Lagos',
          country: 'Nigeria',
          placeId: 'ChIJ...',
          addressComponents: {
            streetAddress: '12 Admiralty Way',
            city: 'Lagos',
            state: 'Lagos',
            country: 'Nigeria',
          },
          isDefault: true,
          createdAt: '2026-01-25T12:00:00.000Z',
          updatedAt: '2026-01-25T12:00:00.000Z',
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAddresses(@GetUser('id') userId: string) {
    const addresses = await this.userService.getAddresses(userId);
    return ResponseUtil.success(addresses, 'Addresses fetched successfully');
  }

  @Get('addresses/:id')
  @ApiOperation({ summary: 'Get a user address by id' })
  @ApiResponse({
    status: 200,
    description: 'Address fetched successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  async getAddressById(
    @GetUser('id') userId: string,
    @Param('id') addressId: string,
  ) {
    const address = await this.userService.getAddressById(userId, addressId);
    return ResponseUtil.success(address, 'Address fetched successfully');
  }

  @Post('addresses')
  @UsePipes(addressValidationPipe)
  @ApiOperation({ summary: 'Create a new address' })
  @ApiResponse({
    status: 201,
    description: 'Address created successfully',
    example: {
      success: true,
      message: 'Address created successfully',
      data: {
        id: '660e8400-e29b-41d4-a716-446655440000',
        label: 'Home',
        fullAddress: '12 Admiralty Way, Lekki Phase 1, Lagos, Nigeria',
        streetAddress: '12 Admiralty Way',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        placeId: 'ChIJ...',
        addressComponents: {
          streetAddress: '12 Admiralty Way',
          city: 'Lagos',
          state: 'Lagos',
          country: 'Nigeria',
        },
        isDefault: true,
        createdAt: '2026-01-25T12:00:00.000Z',
        updatedAt: '2026-01-25T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createAddress(
    @GetUser('id') userId: string,
    @Body() createAddressDto: CreateAddressDto,
  ) {
    const address = await this.userService.createAddress(
      userId,
      createAddressDto,
    );
    return ResponseUtil.success(address, 'Address created successfully');
  }

  @Patch('addresses/:id')
  @UsePipes(addressValidationPipe)
  @ApiOperation({ summary: 'Partially update an existing address' })
  @ApiResponse({
    status: 200,
    description: 'Address updated successfully',
    example: {
      success: true,
      message: 'Address updated successfully',
      data: {
        id: '660e8400-e29b-41d4-a716-446655440000',
        label: 'Office',
        fullAddress: '25 Victoria Island, Lagos, Nigeria',
        streetAddress: '25 Victoria Island',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        placeId: 'ChIJ...',
        addressComponents: {
          streetAddress: '25 Victoria Island',
          city: 'Lagos',
          state: 'Lagos',
          country: 'Nigeria',
        },
        isDefault: false,
        createdAt: '2026-01-25T12:00:00.000Z',
        updatedAt: '2026-01-25T13:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  async updateAddress(
    @GetUser('id') userId: string,
    @Param('id') addressId: string,
    @Body() updateAddressDto: UpdateAddressDto,
  ) {
    const address = await this.userService.updateAddress(
      userId,
      addressId,
      updateAddressDto,
    );
    return ResponseUtil.success(address, 'Address updated successfully');
  }

  @Put('addresses/:id')
  @UsePipes(addressValidationPipe)
  @ApiOperation({ summary: 'Update an existing address (legacy alias)' })
  @ApiResponse({ status: 200, description: 'Address updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  async updateAddressLegacy(
    @GetUser('id') userId: string,
    @Param('id') addressId: string,
    @Body() updateAddressDto: UpdateAddressDto,
  ) {
    const address = await this.userService.updateAddress(
      userId,
      addressId,
      updateAddressDto,
    );
    return ResponseUtil.success(address, 'Address updated successfully');
  }

  @Patch('addresses/:id/default')
  @ApiOperation({ summary: 'Set an address as default' })
  @ApiResponse({
    status: 200,
    description: 'Default address updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  async setDefaultAddress(
    @GetUser('id') userId: string,
    @Param('id') addressId: string,
  ) {
    const address = await this.userService.setDefaultAddress(userId, addressId);
    return ResponseUtil.success(
      address,
      'Default address updated successfully',
    );
  }

  @Delete('addresses/:id')
  @ApiOperation({ summary: 'Delete an address' })
  @ApiResponse({
    status: 200,
    description: 'Address deleted successfully',
    example: {
      success: true,
      message: 'Address deleted successfully',
      data: {
        message: 'Address deleted successfully',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Address not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete address that is used in bookings',
  })
  async deleteAddress(
    @GetUser('id') userId: string,
    @Param('id') addressId: string,
  ) {
    const result = await this.userService.deleteAddress(userId, addressId);
    return ResponseUtil.success(result, result.message);
  }
}
