import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes, randomInt, randomUUID } from 'crypto';
import { ErrorMessages } from '../common/constants/error-messages';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ReferralService } from '../referral/referral.service';
import { CreatePinDto } from './dto/create-pin.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterBeauticianDto } from './dto/register-beautician.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdatePinDto } from './dto/update-pin.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';
import { PinService } from './pin.service';
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
    private pinService: PinService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName, phone, referralCode } =
      registerDto;

    const normalizedEmail = email.toLowerCase();

    // An email may already belong to a BEAUTICIAN account. In that case this is
    // a LINKED registration: the same person is creating their USER account.
    // Nothing else gets to reuse the email.
    const existingUser = await this.prisma.user.findFirst({
      where: { email: normalizedEmail },
      select: { id: true, role: true, identityGroupId: true },
    });

    let linkContext: { parentId: string; groupId: string } | null = null;
    if (existingUser) {
      if (existingUser.role === UserRole.BEAUTICIAN) {
        linkContext = {
          parentId: existingUser.id,
          groupId: existingUser.identityGroupId ?? randomUUID(),
        };
      } else {
        throw new ConflictException(ErrorMessages.USER_ALREADY_EXISTS);
      }
    }

    // Phone may be shared with an account already owned by the same person
    // (same identity group), but never with someone else's account.
    await this.assertPhoneAcrossGroups(
      phone,
      linkContext?.groupId,
      linkContext?.parentId,
    );

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
      // If the existing parent account predates identity groups, give it and
      // the new linked account a fresh shared group.
      if (linkContext) {
        await tx.user.update({
          where: { id: linkContext.parentId },
          data: { identityGroupId: linkContext.groupId },
        });
      }

      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          ...(linkContext ? { identityGroupId: linkContext.groupId } : {}),
          otpCode,
          otpExpiry,
        },
        select: {
          id: true,
          email: true,
          identityGroupId: true,
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

    // Generate personal referral code (non-fatal)
    try {
      await this.referralService.createReferralCode(user.id, firstName);
    } catch (referralErr) {
      this.logger.warn(
        `Referral code generation failed for user ${user.id} (non-fatal): ${
          referralErr instanceof Error
            ? referralErr.message
            : String(referralErr)
        }`,
      );
    }

    // Apply optional signup code (campaign or user referral) without blocking registration
    if (referralCode) {
      try {
        await this.referralService.applySignupCode(user.id, referralCode);
      } catch (referralErr) {
        this.logger.warn(
          `Signup code application failed for user ${user.id} (non-fatal): ${
            referralErr instanceof Error
              ? referralErr.message
              : String(referralErr)
          }`,
        );
      }
    }

    // Send OTP email
    await this.mailService.sendOtpEmail(user.email, otpCode, user.firstName);

    // Start a fresh single-device session and generate tokens
    const sessionId = await this.rotateActiveSession(user.id);
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      sessionId,
    );

    return {
      user,
      ...tokens,
      message:
        'Registration successful. Please verify your email with the OTP sent to your email address.',
    };
  }

  async registerBeautician(registerDto: RegisterBeauticianDto) {
    const { email, password, firstName, lastName, phone, dateOfBirth } =
      registerDto;

    const normalizedEmail = email.toLowerCase();
    const parsedDateOfBirth =
      dateOfBirth instanceof Date
        ? dateOfBirth
        : this.parseDateOfBirth(String(dateOfBirth));

    // An email may already belong to a USER account. In that case this is a
    // LINKED registration: the same person is creating their BEAUTICIAN
    // account. Nothing else gets to reuse the email.
    const existingUser = await this.prisma.user.findFirst({
      where: { email: normalizedEmail },
      select: { id: true, role: true, identityGroupId: true },
    });

    let linkContext: { parentId: string; groupId: string } | null = null;
    if (existingUser) {
      if (existingUser.role === UserRole.USER) {
        linkContext = {
          parentId: existingUser.id,
          groupId: existingUser.identityGroupId ?? randomUUID(),
        };
      } else {
        throw new ConflictException(ErrorMessages.USER_ALREADY_EXISTS);
      }
    }

    await this.assertBeauticianIdentityAvailable({
      firstName,
      lastName,
      dateOfBirth: parsedDateOfBirth,
      allowedGroupId: linkContext?.groupId,
      excludeUserId: linkContext?.parentId,
    });

    // Phone may be shared with an account already owned by the same person
    // (same identity group), but never with someone else's account.
    await this.assertPhoneAcrossGroups(
      phone,
      linkContext?.groupId,
      linkContext?.parentId,
    );

    const hashedPassword = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 4,
      parallelism: 1,
    });

    const otpCode = this.generateOtpCode();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const user = await this.prisma.$transaction(async (tx) => {
      // If the existing parent account predates identity groups, give it and
      // the new linked account a fresh shared group.
      if (linkContext) {
        await tx.user.update({
          where: { id: linkContext.parentId },
          data: { identityGroupId: linkContext.groupId },
        });
      }

      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          dateOfBirth: parsedDateOfBirth,
          role: UserRole.BEAUTICIAN,
          status: UserStatus.ACTIVE,
          ...(linkContext ? { identityGroupId: linkContext.groupId } : {}),
          otpCode,
          otpExpiry,
        },
        select: {
          id: true,
          email: true,
          identityGroupId: true,
          firstName: true,
          lastName: true,
          phone: true,
          dateOfBirth: true,
          role: true,
          status: true,
          emailVerified: true,
          createdAt: true,
        },
      });

      await tx.wallet.create({
        data: {
          userId: newUser.id,
          balance: 0,
        },
      });

      await tx.beauticianProfile.create({
        data: {
          userId: newUser.id,
        },
      });

      return newUser;
    });

    await this.mailService.sendOtpEmail(user.email, otpCode, user.firstName);

    const sessionId = await this.rotateActiveSession(user.id);
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      sessionId,
    );

    return {
      user,
      ...tokens,
      message:
        'Beautician registration successful. Please verify your email with the OTP sent to your email address.',
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password, type } = loginDto;

    // Find the account. When `type` is given, it disambiguates which
    // role-scoped account (USER vs BEAUTICIAN) the email refers to, since one
    // person can now hold both. Without `type` we keep the legacy behaviour.
    const user = await this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        ...(type ? { role: type as unknown as UserRole } : {}),
      },
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
      if (type) {
        throw new UnauthorizedException(
          `No ${type.toLowerCase()} account exists for this email. Please register as a ${type.toLowerCase()} first.`,
        );
      }
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

    return this.buildAuthenticatedResponse(user);
  }

  async refreshToken(refreshToken: string) {
    try {
      // Verify refresh token
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      if (!payload.sessionId) {
        throw new UnauthorizedException(ErrorMessages.INVALID_TOKEN);
      }

      // Check if refresh token exists in database
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      });

      if (!storedToken || storedToken.userId !== payload.sub) {
        throw new UnauthorizedException(ErrorMessages.INVALID_TOKEN);
      }

      // Reject refresh tokens from replaced sessions
      if (storedToken.user.currentSessionId !== payload.sessionId) {
        throw new UnauthorizedException(ErrorMessages.SESSION_REVOKED);
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

      // Delete old refresh token then generate new ones atomically
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });

      const tokens = await this.generateTokens(
        storedToken.userId,
        storedToken.user.email,
        storedToken.user.role,
        payload.sessionId,
      );

      return tokens;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(ErrorMessages.INVALID_TOKEN);
    }
  }

  /**
   * Generates a password-setup token and emails it. Shared by genuine
   * forgot-password requests and by brand-new accounts that start with an
   * unusable random password (e.g. staff created via convertToStaff).
   */
  async initiatePasswordSetup(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(ErrorMessages.USER_NOT_FOUND);

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000);
    const hashedResetToken = await argon2.hash(resetToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: hashedResetToken, resetTokenExpiry },
    });

    await this.mailService.sendPasswordResetEmail(
      user.email,
      resetToken,
      user.firstName,
      user.role,
    );
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email, type } = forgotPasswordDto;
    const user = await this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        ...(type ? { role: type as unknown as UserRole } : {}),
      },
    });

    if (!user) {
      return {
        message: 'If the email exists, a password reset link has been sent',
      };
    }

    await this.initiatePasswordSetup(user.id);

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

  private async generateTokens(
    userId: string,
    email: string,
    role: UserRole,
    sessionId: string,
  ) {
    const payload = { sub: userId, email, role, sessionId };

    const accessToken = this.jwtService.sign({ ...payload }, {
      secret: this.configService.get<string>('JWT_SECRET') || 'default-secret',
      expiresIn: this.configService.get<string>('JWT_EXPIRATION') || '15m',
    } as never);

    const refreshToken = this.jwtService.sign(
      { ...payload, jti: randomBytes(16).toString('hex') },
      {
        secret:
          this.configService.get<string>('JWT_REFRESH_SECRET') ||
          'default-refresh-secret',
        expiresIn:
          this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d',
      } as never,
    );

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: { token: refreshToken, userId, expiresAt },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async validateUser(userId: string, sessionId?: string) {
    if (!sessionId) {
      throw new UnauthorizedException(ErrorMessages.INVALID_TOKEN);
    }

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
      currentSessionId: string | null;
      adminRole: { id: string; name: string } | null;
      hasPin: boolean;
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
          currentSessionId: true,
          pin: true,
          adminRole: {
            select: { id: true, name: true },
          },
        },
      });

      if (!dbUser) {
        throw new NotFoundException(ErrorMessages.USER_NOT_FOUND);
      }

      const { pin, ...userWithoutPin } = dbUser;
      user = {
        ...userWithoutPin,
        hasPin: !!pin,
      };
      // Cache for 5 min — invalidated on status change, role reassign, or delete
      await this.redis.set(profileKey, user, 300);
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException(ErrorMessages.ACCOUNT_INACTIVE);
    }

    if (!user.currentSessionId || user.currentSessionId !== sessionId) {
      throw new UnauthorizedException(ErrorMessages.SESSION_REVOKED);
    }

    const roleAssignments = await this.prisma.userRoleAssignment.findMany({
      where: { userId: user.id },
      select: { role: true },
    });

    const roles = Array.from(
      new Set([user.role, ...roleAssignments.map((r) => r.role)]),
    );

    const permissions = await this.getPermissionsForUser(
      user.role,
      user.adminRoleId ?? null,
      user.id,
    );

    return { ...user, permissions, roles };
  }

  private async getPermissionsForUser(
    role: UserRole,
    adminRoleId: string | null,
    userId: string,
  ): Promise<string[]> {
    if (role === UserRole.SUPER_ADMIN) return ['*'];

    const roleIds = new Set<string>();
    if (adminRoleId) roleIds.add(adminRoleId);

    const additional = await this.prisma.userAdminRole.findMany({
      where: { userId },
      select: { adminRoleId: true },
    });
    additional.forEach((r) => roleIds.add(r.adminRoleId));

    if (roleIds.size === 0) return [];

    const permissionSets = await Promise.all(
      Array.from(roleIds).map((id) => this.getPermissionsForRole(id)),
    );
    return Array.from(new Set(permissionSets.flat()));
  }

  /**
   * Permissions for a single role, respecting isActive — a deactivated
   * role now correctly grants nothing, whether read fresh or from cache.
   */
  private async getPermissionsForRole(adminRoleId: string): Promise<string[]> {
    const cacheKey = `permissions:adminrole:${adminRoleId}`;
    const cached = await this.redis.get<string[]>(cacheKey);
    if (cached) return cached;

    const role = await this.prisma.adminRole.findUnique({
      where: { id: adminRoleId },
      select: { isActive: true, permissions: { select: { permission: true } } },
    });

    const permissions = role?.isActive
      ? role.permissions.map((p) => p.permission)
      : [];
    await this.redis.set(cacheKey, permissions, 300);
    return permissions;
  }

  private async buildAuthenticatedResponse(user: {
    id: string;
    email: string;
    role: UserRole;
    adminRoleId: string | null;
    adminRole?: { id: string; name: string } | null;
    influencer?: { id: string; isActive: boolean } | null;
    password: string;
    otpCode: string | null;
    otpExpiry: Date | null;
    resetToken: string | null;
    resetTokenExpiry: Date | null;
    pin?: string | null;
    [key: string]: unknown;
  }) {
    const sessionId = await this.rotateActiveSession(user.id);
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      sessionId,
    );

    const permissions = await this.getPermissionsForUser(
      user.role,
      user.adminRoleId ?? null,
      user.id,
    );

    // ── same computation as validateUser() ──
    const roleAssignments = await this.prisma.userRoleAssignment.findMany({
      where: { userId: user.id },
      select: { role: true },
    });
    const roles = Array.from(
      new Set([user.role, ...roleAssignments.map((r) => r.role)]),
    );

    const hasPin = !!user.pin;

    const {
      password: _,
      otpCode,
      otpExpiry,
      resetToken,
      resetTokenExpiry,
      pin: __,
      ...userWithoutSensitiveData
    } = user;

    return {
      user: {
        ...userWithoutSensitiveData,
        adminRole: user.adminRole ?? null,
        permissions,
        roles,
        hasPin,
      },
      ...tokens,
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { email, otpCode, type } = verifyOtpDto;

    const user = await this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        ...(type ? { role: type as unknown as UserRole } : {}),
      },
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

    const verifiedUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        adminRole: {
          select: { id: true, name: true },
        },
        influencer: {
          select: { id: true, isActive: true },
        },
      },
    });

    if (!verifiedUser) {
      throw new NotFoundException(ErrorMessages.USER_NOT_FOUND);
    }

    return this.buildAuthenticatedResponse(verifiedUser);
  }

  async resendOtp(resendOtpDto: ResendOtpDto) {
    const { email, type } = resendOtpDto;

    const user = await this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        ...(type ? { role: type as unknown as UserRole } : {}),
      },
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

  // ─────────────────────────────────────────────────────────────────────────────
  // PIN Management (delegates to PinService + handles post-change token rotation)
  // ─────────────────────────────────────────────────────────────────────────────

  async createPin(userId: string, dto: CreatePinDto) {
    await this.pinService.createPin(userId, dto);

    // Security best practice: rotate session after setting a new security credential
    const authPayload = await this.buildAuthPayloadAfterPinChange(userId);

    return {
      ...authPayload,
      message: 'PIN created successfully',
    };
  }

  async verifyPin(userId: string, dto: VerifyPinDto) {
    const result = await this.pinService.verifyPin(userId, dto);
    return result; // { verified: true }
  }

  async updatePin(userId: string, dto: UpdatePinDto) {
    await this.pinService.updatePin(userId, dto);

    // Rotate session + return fresh tokens after PIN change
    const authPayload = await this.buildAuthPayloadAfterPinChange(userId);

    return {
      ...authPayload,
      message: 'PIN updated successfully',
    };
  }

  async getPinStatus(userId: string) {
    return this.pinService.getPinStatus(userId);
  }

  /**
   * After a PIN create or update, rotate the active session (invalidates other devices)
   * and return a fresh authenticated payload (user + tokens) following the same shape
   * as login / register responses.
   */
  private async buildAuthPayloadAfterPinChange(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
      throw new NotFoundException(ErrorMessages.USER_NOT_FOUND);
    }

    const sessionId = await this.rotateActiveSession(userId);
    const tokens = await this.generateTokens(
      userId,
      user.email,
      user.role,
      sessionId,
    );

    const permissions = await this.getPermissionsForUser(
      user.role,
      user.adminRoleId ?? null,
      userId,
    );

    // Remove sensitive fields
    const {
      password: _p,
      otpCode: _o,
      otpExpiry: _oe,
      resetToken: _r,
      resetTokenExpiry: _re,
      pin: _pin,
      pinFailedAttempts: _fa,
      pinLockedUntil: _lu,
      ...safeUser
    } = user as any;

    return {
      user: {
        ...safeUser,
        adminRole: user.adminRole ?? null,
        permissions,
      },
      ...tokens,
    };
  }

  private parseDateOfBirth(dateOfBirth: string): Date {
    const [year, month, day] = dateOfBirth.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private async assertBeauticianIdentityAvailable(input: {
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    allowedGroupId?: string;
    excludeUserId?: string;
  }): Promise<void> {
    const existingIdentity = await this.prisma.user.findMany({
      where: {
        firstName: { equals: input.firstName, mode: 'insensitive' },
        lastName: { equals: input.lastName, mode: 'insensitive' },
        dateOfBirth: input.dateOfBirth,
      },
      select: { id: true, identityGroupId: true },
    });

    // Another account in the same identity group (i.e. the same person) may
    // share the identity; nobody outside the group may.
    const conflict = existingIdentity.some(
      (u) =>
        u.id !== input.excludeUserId &&
        u.identityGroupId !== input.allowedGroupId,
    );

    if (conflict) {
      throw new ConflictException(
        ErrorMessages.BEAUTICIAN_IDENTITY_ALREADY_EXISTS,
      );
    }
  }

  private async assertPhoneAcrossGroups(
    phone: string | undefined,
    allowedGroupId: string | undefined,
    excludeUserId?: string,
  ): Promise<void> {
    if (!phone) return;

    const existingPhones = await this.prisma.user.findMany({
      where: { phone },
      select: { id: true, identityGroupId: true },
    });

    // An account owned by the same person (same identity group) may reuse the
    // phone; nobody outside the group may.
    const conflict = existingPhones.some(
      (u) => u.id !== excludeUserId && u.identityGroupId !== allowedGroupId,
    );

    if (conflict) {
      throw new ConflictException(ErrorMessages.PHONE_ALREADY_EXISTS);
    }
  }

  private generateOtpCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  private async rotateActiveSession(userId: string): Promise<string> {
    const sessionId = this.generateSessionId();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { currentSessionId: sessionId },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId },
      }),
    ]);

    await this.redis.del(`user:profile:${userId}`);

    return sessionId;
  }
}
