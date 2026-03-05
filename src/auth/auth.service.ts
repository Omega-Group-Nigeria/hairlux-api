import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ErrorMessages } from '../common/constants/error-messages';
import { randomBytes } from 'crypto';
import { UserRole, UserStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { ReferralService } from '../referral/referral.service';
import { RedisService } from '../redis/redis.service';
import { JwtPayload } from './types/jwt-payload.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
    private referralService: ReferralService,
    private redis: RedisService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName, phone, referralCode } =
      registerDto;

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException(ErrorMessages.USER_ALREADY_EXISTS);
    }

    // Check if phone number is already in use
    if (phone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: { phone },
        select: { id: true },
      });
      if (existingPhone) {
        throw new ConflictException(
          'Phone number is already associated with an account',
        );
      }
    }

    // Hash password using argon2id
    const hashedPassword = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MiB
      timeCost: 4,
      parallelism: 1,
    });

    // Generate OTP
    const otpCode = this.generateOtpCode();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user and wallet in transaction
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          otpCode,
          otpExpiry,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          emailVerified: true,
          createdAt: true,
        },
      });

      // Create wallet for user
      await tx.wallet.create({
        data: {
          userId: newUser.id,
          balance: 0,
        },
      });

      return newUser;
    });

    // Handle referral code linking (non-fatal)
    try {
      await this.referralService.createReferralCode(user.id, firstName);
      if (referralCode) {
        await this.referralService.linkReferral(user.id, referralCode);
      }
    } catch (referralErr) {
      // Referral errors must never break registration
      this.logger.warn(
        `Referral setup failed for user ${user.id} (non-fatal): ${
          referralErr instanceof Error
            ? referralErr.message
            : String(referralErr)
        }`,
      );
    }

    // Send OTP email
    await this.mailService.sendOtpEmail(user.email, otpCode, user.firstName);

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      user,
      ...tokens,
      message:
        'Registration successful. Please verify your email with the OTP sent to your email address.',
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        adminRole: {
          select: { id: true, name: true },
        },
        influencer: {
          select: { id: true, isActive: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException(ErrorMessages.INVALID_CREDENTIALS);
    }

    // Check if account is active
    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException(ErrorMessages.ACCOUNT_INACTIVE);
    }

    // Check if email is verified
    if (!user.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in. Check your email for the OTP code.',
      );
    }

    // Verify password
    const isPasswordValid = await argon2.verify(user.password, password);

    if (!isPasswordValid) {
      throw new UnauthorizedException(ErrorMessages.INVALID_CREDENTIALS);
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Fetch permissions for the response
    const permissions = await this.getPermissionsForUser(
      user.role,
      user.adminRoleId ?? null,
    );

    // Remove sensitive fields from response
    const {
      password: _,
      otpCode,
      otpExpiry,
      resetToken,
      resetTokenExpiry,
      ...userWithoutSensitiveData
    } = user;

    return {
      user: {
        ...userWithoutSensitiveData,
        adminRole: user.adminRole ?? null,
        permissions,
      },
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      // Verify refresh token
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      // Check if refresh token exists in database
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      });

      if (!storedToken || storedToken.userId !== payload.sub) {
        throw new UnauthorizedException(ErrorMessages.INVALID_TOKEN);
      }

      // Check if token is expired
      if (storedToken.expiresAt < new Date()) {
        await this.prisma.refreshToken.delete({
          where: { id: storedToken.id },
        });
        throw new UnauthorizedException(ErrorMessages.INVALID_TOKEN);
      }

      // Check if user is active
      if (storedToken.user.status === UserStatus.INACTIVE) {
        throw new UnauthorizedException(ErrorMessages.ACCOUNT_INACTIVE);
      }

      // Generate new tokens
      const tokens = await this.generateTokens(
        storedToken.userId,
        storedToken.user.email,
        storedToken.user.role,
      );

      // Delete old refresh token
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });

      return tokens;
    } catch (error) {
      throw new UnauthorizedException(ErrorMessages.INVALID_TOKEN);
    }
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Don't reveal if user exists or not
    if (!user) {
      return {
        message: 'If the email exists, a password reset link has been sent',
      };
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    // Hash reset token before storing
    const hashedResetToken = await argon2.hash(resetToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashedResetToken,
        resetTokenExpiry,
      },
    });

    // TODO: Send email with reset link containing the token
    await this.mailService.sendPasswordResetEmail(
      user.email,
      resetToken,
      user.firstName,
    );

    return {
      message: 'If the email exists, a password reset link has been sent',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;

    // Find users with non-expired reset tokens
    const users = await this.prisma.user.findMany({
      where: {
        resetToken: { not: null },
        resetTokenExpiry: { gte: new Date() },
      },
    });

    // Find matching user by verifying token
    let matchedUser: (typeof users)[0] | null = null;
    for (const user of users) {
      if (user.resetToken) {
        const isValid = await argon2.verify(user.resetToken, token);
        if (isValid) {
          matchedUser = user;
          break;
        }
      }
    }

    if (!matchedUser) {
      throw new BadRequestException(ErrorMessages.INVALID_RESET_TOKEN);
    }

    // Hash new password
    const hashedPassword = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 4,
      parallelism: 1,
    });

    // Update password and clear reset token
    await this.prisma.user.update({
      where: { id: matchedUser.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    return {
      message: 'Password has been reset successfully',
    };
  }

  private async generateTokens(userId: string, email: string, role: UserRole) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign({ ...payload }, {
      secret: this.configService.get<string>('JWT_SECRET') || 'default-secret',
      expiresIn: this.configService.get<string>('JWT_EXPIRATION') || '15m',
    } as never);

    const refreshToken = this.jwtService.sign({ ...payload }, {
      secret:
        this.configService.get<string>('JWT_REFRESH_SECRET') ||
        'default-refresh-secret',
      expiresIn:
        this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d',
    } as never);

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async validateUser(userId: string) {
    const profileKey = `user:profile:${userId}`;
    const cached = await this.redis.get<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      phone: string | null;
      role: UserRole;
      status: UserStatus;
      adminRoleId: string | null;
      adminRole: { id: string; name: string } | null;
    }>(profileKey);

    let user: NonNullable<typeof cached>;

    if (cached) {
      user = cached;
    } else {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          adminRoleId: true,
          adminRole: {
            select: { id: true, name: true },
          },
        },
      });

      if (!dbUser) {
        throw new NotFoundException(ErrorMessages.USER_NOT_FOUND);
      }

      user = dbUser;
      // Cache for 5 min — invalidated on status change, role reassign, or delete
      await this.redis.set(profileKey, user, 300);
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException(ErrorMessages.ACCOUNT_INACTIVE);
    }

    const permissions = await this.getPermissionsForUser(
      user.role,
      user.adminRoleId ?? null,
    );

    return { ...user, permissions };
  }

  private async getPermissionsForUser(
    role: UserRole,
    adminRoleId: string | null,
  ): Promise<string[]> {
    if (role === UserRole.SUPER_ADMIN) return ['*'];
    if (!adminRoleId) return [];

    const cacheKey = `permissions:adminrole:${adminRoleId}`;
    const cached = await this.redis.get<string[]>(cacheKey);
    if (cached) return cached;

    const rolePerms = await this.prisma.adminRolePermission.findMany({
      where: { adminRoleId },
      select: { permission: true },
    });

    const permissions = rolePerms.map((p) => p.permission);
    await this.redis.set(cacheKey, permissions, 300); // 5 min TTL
    return permissions;
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { email, otpCode } = verifyOtpDto;

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new NotFoundException(ErrorMessages.USER_NOT_FOUND);
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    if (!user.otpCode || !user.otpExpiry) {
      throw new BadRequestException('No OTP found. Please request a new one.');
    }

    if (user.otpExpiry < new Date()) {
      throw new BadRequestException(
        'OTP has expired. Please request a new one.',
      );
    }

    if (user.otpCode !== otpCode) {
      throw new BadRequestException('Invalid OTP code');
    }

    // Mark email as verified and clear OTP
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        otpCode: null,
        otpExpiry: null,
      },
    });

    return {
      message: 'Email verified successfully',
    };
  }

  async resendOtp(resendOtpDto: ResendOtpDto) {
    const { email } = resendOtpDto;

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new NotFoundException(ErrorMessages.USER_NOT_FOUND);
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Generate new OTP
    const otpCode = this.generateOtpCode();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user with new OTP
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode,
        otpExpiry,
      },
    });

    // Send OTP email
    await this.mailService.sendOtpEmail(user.email, otpCode, user.firstName);

    return {
      message: 'OTP has been resent to your email',
    };
  }

  private generateOtpCode(): string {
    // Generate 6-digit OTP
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
