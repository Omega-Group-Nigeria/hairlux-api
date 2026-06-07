import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { CreatePinDto } from './dto/create-pin.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';
import { UpdatePinDto } from './dto/update-pin.dto';
import { ResponseUtil } from '../common/utils/response.util';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    example: {
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'john.doe@example.com',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+2348012345678',
          role: 'USER',
          status: 'ACTIVE',
          createdAt: '2026-01-25T12:00:00.000Z',
        },
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({ status: 409, description: 'User already exists' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async register(@Body() registerDto: RegisterDto) {
    const result = await this.authService.register(registerDto);
    return ResponseUtil.success(result, 'User registered successfully');
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    example: {
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'jane@hairlux.com',
          firstName: 'Jane',
          lastName: 'Doe',
          phone: '+2348012345678',
          role: 'USER',
          status: 'ACTIVE',
          adminRole: null,
          permissions: [],
          influencer: null,
        },
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful — user is an influencer',
    example: {
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'amara@example.com',
          firstName: 'Amara',
          lastName: 'Okafor',
          phone: '+2348012345678',
          role: 'USER',
          status: 'ACTIVE',
          adminRole: null,
          permissions: [],
          influencer: {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            isActive: true,
          },
        },
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    const result = await this.authService.login(loginDto);
    return ResponseUtil.success(result, 'Login successful');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user',
    description:
      'Returns the authenticated user with their admin role and full permissions array. Call this on page load/refresh to restore frontend auth state.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user retrieved successfully',
    example: {
      success: true,
      message: 'User retrieved successfully',
      data: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'jane@hairlux.com',
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+2348012345678',
        role: 'USER',
        status: 'ACTIVE',
        adminRoleId: 'b2f7e1a0-3c14-4f2b-9e8d-1a2b3c4d5e6f',
        adminRole: {
          id: 'b2f7e1a0-3c14-4f2b-9e8d-1a2b3c4d5e6f',
          name: 'Receptionist',
        },
        permissions: [
          'bookings:read',
          'bookings:verify_reservation',
          'users:read',
        ],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — token missing or expired',
  })
  getMe(@GetUser() user: Express.User) {
    return ResponseUtil.success(user, 'User retrieved successfully');
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    example: {
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    const result = await this.authService.refreshToken(
      refreshTokenDto.refreshToken,
    );
    return ResponseUtil.success(result, 'Token refreshed successfully');
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent',
    example: {
      success: true,
      message: 'If the email exists, a password reset link has been sent',
      data: {
        message: 'If the email exists, a password reset link has been sent',
      },
    },
  })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(forgotPasswordDto);
    return ResponseUtil.success(result, result.message);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    example: {
      success: true,
      message: 'Password has been reset successfully',
      data: {
        message: 'Password has been reset successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset token' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(resetPasswordDto);
    return ResponseUtil.success(result, result.message);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email with OTP code',
    description:
      'Verifies the OTP and signs the user in immediately, returning the same auth payload shape as /login.',
  })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
    example: {
      success: true,
      message: 'Email verified successfully',
      data: {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'jane@hairlux.com',
          firstName: 'Jane',
          lastName: 'Doe',
          phone: '+2348012345678',
          role: 'USER',
          status: 'ACTIVE',
          adminRole: null,
          permissions: [],
          influencer: null,
        },
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    const result = await this.authService.verifyOtp(verifyOtpDto);
    return ResponseUtil.success(result, 'Email verified successfully');
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP verification code' })
  @ApiResponse({
    status: 200,
    description: 'OTP resent successfully',
    example: {
      success: true,
      message: 'OTP has been resent to your email',
      data: {
        message: 'OTP has been resent to your email',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Email already verified' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async resendOtp(@Body() resendOtpDto: ResendOtpDto) {
    const result = await this.authService.resendOtp(resendOtpDto);
    return ResponseUtil.success(result, result.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PIN Management Endpoints (secure, modular, single-responsibility via PinService)
  // ─────────────────────────────────────────────────────────────────────────────

  @Post('pin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create / Set initial transaction PIN',
    description:
      'Sets a 4-6 digit numeric PIN for the authenticated user. ' +
      'Requires current password for the initial setup. ' +
      'On success, rotates the session and returns fresh tokens (same shape as login).',
  })
  @ApiResponse({
    status: 200,
    description: 'PIN created successfully. Fresh tokens issued.',
    example: {
      success: true,
      message: 'PIN created successfully',
      data: {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'jane@hairlux.com',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'USER',
        },
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'PIN already set or validation error' })
  @ApiResponse({ status: 401, description: 'Invalid password or unauthorized' })
  async createPin(
    @GetUser('id') userId: string,
    @Body() dto: CreatePinDto,
  ) {
    const result = await this.authService.createPin(userId, dto);
    return ResponseUtil.success(result, result.message);
  }

  @Get('pin/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get PIN status for current user',
    description: 'Returns whether a PIN is configured and current lock state.',
  })
  @ApiResponse({
    status: 200,
    description: 'PIN status retrieved',
    example: {
      success: true,
      message: 'PIN status retrieved successfully',
      data: {
        hasPin: true,
        isLocked: false,
        lockedUntil: null,
        failedAttempts: 0,
      },
    },
  })
  async getPinStatus(@GetUser('id') userId: string) {
    const status = await this.authService.getPinStatus(userId);
    return ResponseUtil.success(status, 'PIN status retrieved successfully');
  }

  @Post('pin/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify transaction / security PIN',
    description:
      'Verifies the user\'s PIN. Use this before sensitive actions (e.g. large transfers, withdrawals). ' +
      'Implements progressive lockout after repeated failures.',
  })
  @ApiResponse({
    status: 200,
    description: 'PIN verified successfully',
    example: {
      success: true,
      message: 'PIN verified successfully',
      data: {
        verified: true,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid PIN or PIN is locked' })
  @ApiResponse({ status: 400, description: 'No PIN set on account' })
  async verifyPin(
    @GetUser('id') userId: string,
    @Body() dto: VerifyPinDto,
  ) {
    const result = await this.authService.verifyPin(userId, dto);
    return ResponseUtil.success(result, 'PIN verified successfully');
  }

  @Put('pin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update / Change existing PIN',
    description:
      'Changes the user\'s PIN. Requires the current PIN. ' +
      'On success, the session is rotated and fresh access/refresh tokens are returned.',
  })
  @ApiResponse({
    status: 200,
    description: 'PIN updated successfully. New tokens returned.',
    example: {
      success: true,
      message: 'PIN updated successfully',
      data: {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'jane@hairlux.com',
        },
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error or no PIN set' })
  @ApiResponse({ status: 401, description: 'Current PIN incorrect or account locked' })
  async updatePin(
    @GetUser('id') userId: string,
    @Body() dto: UpdatePinDto,
  ) {
    const result = await this.authService.updatePin(userId, dto);
    return ResponseUtil.success(result, result.message);
  }
}
