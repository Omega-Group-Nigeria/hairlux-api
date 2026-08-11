import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ReferralService } from '../referral/referral.service';
import { RedisService } from '../redis/redis.service';
import { PinService } from './pin.service';
import { ErrorMessages } from '../common/constants/error-messages';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    wallet: { create: jest.fn() },
    beauticianProfile: { create: jest.fn() },
    refreshToken: { create: jest.fn(), deleteMany: jest.fn() },
    userRoleAssignment: { findMany: jest.fn() },
    userAdminRole: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockMailService = { sendOtpEmail: jest.fn() };
  const mockReferralService = {
    createReferralCode: jest.fn(),
    applySignupCode: jest.fn(),
  };
  const mockRedis = { set: jest.fn(), del: jest.fn(), get: jest.fn() };
  const mockJwtService = {
    sign: jest.fn().mockReturnValue('access-token'),
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };
  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      if (key === 'JWT_EXPIRES_IN') return '15m';
      if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
      if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
      return undefined;
    }),
  };
  const mockPinService = {};

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MailService, useValue: mockMailService },
        { provide: ReferralService, useValue: mockReferralService },
        { provide: RedisService, useValue: mockRedis },
        { provide: PinService, useValue: mockPinService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('registerBeautician', () => {
    const registerDto = {
      email: 'stylist@example.com',
      password: 'SecurePass123',
      firstName: 'Ada',
      lastName: 'Okafor',
      phone: '+2348012345678',
      dateOfBirth: '1996-06-15',
    };

    const parsedDateOfBirth = new Date(Date.UTC(1996, 5, 15));

    const mockAvailabilityChecks = () => {
      // No existing account for this email, and no phone/identity clashes.
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.findMany.mockResolvedValue([]);
    };

    const mockTransaction = (createdUser: Record<string, unknown>) => {
      mockPrisma.$transaction.mockImplementation(async (arg) => {
        if (typeof arg === 'function') {
          return arg({
            user: {
              update: jest.fn().mockResolvedValue({}),
              create: jest.fn().mockResolvedValue(createdUser),
            },
            wallet: {
              create: jest.fn().mockResolvedValue({ id: 'wallet-uuid' }),
            },
            beauticianProfile: {
              create: jest.fn().mockResolvedValue({ id: 'profile-uuid' }),
            },
          });
        }
        return Promise.all(arg);
      });
    };

    const mockSession = () => {
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      mockRedis.del.mockResolvedValue(1);
    };

    it('creates user with BEAUTICIAN role, wallet, and beautician profile', async () => {
      mockAvailabilityChecks();

      const createdUser = {
        id: 'user-uuid',
        email: registerDto.email,
        identityGroupId: 'group-uuid',
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        phone: registerDto.phone,
        dateOfBirth: parsedDateOfBirth,
        role: UserRole.BEAUTICIAN,
        status: UserStatus.ACTIVE,
        emailVerified: false,
        createdAt: new Date(),
      };

      mockTransaction(createdUser);
      mockSession();

      const result = await service.registerBeautician(registerDto);

      expect(result.user.role).toBe(UserRole.BEAUTICIAN);
      expect(result.user.dateOfBirth).toEqual(parsedDateOfBirth);
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: registerDto.email },
        select: { id: true, role: true, identityGroupId: true },
      });
      expect(mockPrisma.user.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          firstName: { equals: registerDto.firstName, mode: 'insensitive' },
          lastName: { equals: registerDto.lastName, mode: 'insensitive' },
          dateOfBirth: parsedDateOfBirth,
        },
        select: { id: true, identityGroupId: true },
      });
      expect(mockPrisma.user.findMany).toHaveBeenNthCalledWith(2, {
        where: { phone: registerDto.phone },
        select: { id: true, identityGroupId: true },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockMailService.sendOtpEmail).toHaveBeenCalledWith(
        createdUser.email,
        expect.any(String),
        createdUser.firstName,
      );
    });

    it('creates a linked BEAUTICIAN account when the email belongs to an existing USER', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'parent-user',
        role: UserRole.USER,
        identityGroupId: 'shared-group',
      });
      mockPrisma.user.findMany.mockResolvedValue([]);

      const createdUser = {
        id: 'beautician-uuid',
        email: registerDto.email,
        identityGroupId: 'shared-group',
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        phone: registerDto.phone,
        dateOfBirth: parsedDateOfBirth,
        role: UserRole.BEAUTICIAN,
        status: UserStatus.ACTIVE,
        emailVerified: false,
        createdAt: new Date(),
      };

      mockTransaction(createdUser);
      mockSession();

      const result = await service.registerBeautician(registerDto);

      expect(result.user.role).toBe(UserRole.BEAUTICIAN);
      expect(result.user.identityGroupId).toBe('shared-group');
      // The linked account inherits the parent's identity group.
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('throws ConflictException when a BEAUTICIAN account already exists for the email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'existing-beautician',
        role: UserRole.BEAUTICIAN,
        identityGroupId: 'group',
      });

      await expect(service.registerBeautician(registerDto)).rejects.toThrow(
        new ConflictException(ErrorMessages.USER_ALREADY_EXISTS),
      );
    });

    it('throws ConflictException when phone belongs to someone outside the identity group', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'someone-else', identityGroupId: 'other-group' },
        ]);

      await expect(service.registerBeautician(registerDto)).rejects.toThrow(
        new ConflictException(ErrorMessages.PHONE_ALREADY_EXISTS),
      );
    });

    it('throws ConflictException when name and date of birth belong to someone outside the identity group', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.findMany
        .mockResolvedValueOnce([
          { id: 'someone-else', identityGroupId: 'other-group' },
        ])
        .mockResolvedValueOnce([]);

      await expect(service.registerBeautician(registerDto)).rejects.toThrow(
        new ConflictException(ErrorMessages.BEAUTICIAN_IDENTITY_ALREADY_EXISTS),
      );
    });

    it('allows the same phone when it belongs to the same identity group', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'parent-user',
        role: UserRole.USER,
        identityGroupId: 'shared-group',
      });
      // Parent owns this phone within the same group, so no clash.
      mockPrisma.user.findMany
        .mockResolvedValueOnce([
          { id: 'parent-user', identityGroupId: 'shared-group' },
        ])
        .mockResolvedValueOnce([]);

      const createdUser = {
        id: 'beautician-uuid',
        email: registerDto.email,
        identityGroupId: 'shared-group',
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        phone: registerDto.phone,
        dateOfBirth: parsedDateOfBirth,
        role: UserRole.BEAUTICIAN,
        status: UserStatus.ACTIVE,
        emailVerified: false,
        createdAt: new Date(),
      };

      mockTransaction(createdUser);
      mockSession();

      const result = await service.registerBeautician(registerDto);

      expect(result.user.role).toBe(UserRole.BEAUTICIAN);
    });
  });

  describe('register', () => {
    const registerDto = {
      email: 'customer@example.com',
      password: 'SecurePass123',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+2348012345678',
    };

    const mockSession = () => {
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      mockRedis.del.mockResolvedValue(1);
    };

    it('creates a USER account with a wallet and referral code', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const createdUser = {
        id: 'user-uuid',
        email: registerDto.email,
        identityGroupId: 'group-uuid',
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        phone: registerDto.phone,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        emailVerified: false,
        createdAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (arg) => {
        if (typeof arg === 'function') {
          return arg({
            user: { create: jest.fn().mockResolvedValue(createdUser) },
            wallet: {
              create: jest.fn().mockResolvedValue({ id: 'wallet-uuid' }),
            },
          });
        }
        return Promise.all(arg);
      });
      mockSession();
      mockReferralService.createReferralCode.mockResolvedValue('JOHN-X7K2');

      const result = await service.register(registerDto);

      expect(result.user.role).toBe(UserRole.USER);
      expect(mockReferralService.createReferralCode).toHaveBeenCalledWith(
        createdUser.id,
        createdUser.firstName,
      );
      expect(mockMailService.sendOtpEmail).toHaveBeenCalled();
    });

    it('creates a linked USER account when the email belongs to an existing BEAUTICIAN', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'parent-beautician',
        role: UserRole.BEAUTICIAN,
        identityGroupId: 'shared-group',
      });
      mockPrisma.user.findMany.mockResolvedValue([]);

      const createdUser = {
        id: 'user-uuid',
        email: registerDto.email,
        identityGroupId: 'shared-group',
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        phone: registerDto.phone,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        emailVerified: false,
        createdAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (arg) => {
        if (typeof arg === 'function') {
          return arg({
            user: {
              update: jest.fn().mockResolvedValue({}),
              create: jest.fn().mockResolvedValue(createdUser),
            },
            wallet: {
              create: jest.fn().mockResolvedValue({ id: 'wallet-uuid' }),
            },
          });
        }
        return Promise.all(arg);
      });
      mockSession();

      const result = await service.register(registerDto);

      expect(result.user.role).toBe(UserRole.USER);
      expect(result.user.identityGroupId).toBe('shared-group');
    });

    it('throws ConflictException when a USER account already exists for the email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'existing-user',
        role: UserRole.USER,
        identityGroupId: 'group',
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        new ConflictException(ErrorMessages.USER_ALREADY_EXISTS),
      );
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'customer@example.com',
      password: 'SecurePass123',
    };

    it('filters by type when provided', async () => {
      const authenticatedUser = {
        id: 'user-uuid',
        email: loginDto.email,
        password: await argon2.hash(loginDto.password),
        firstName: 'John',
        lastName: 'Doe',
        phone: null,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        adminRoleId: null,
        adminRole: null,
        influencer: null,
        pin: null,
        otpCode: null,
        otpExpiry: null,
        resetToken: null,
        resetTokenExpiry: null,
        createdAt: new Date(),
      };

      mockPrisma.user.findFirst.mockResolvedValue(authenticatedUser);
      mockPrisma.userRoleAssignment.findMany.mockResolvedValue([]);
      mockPrisma.userAdminRole.findMany.mockResolvedValue([]);
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      mockRedis.del.mockResolvedValue(1);

      await service.login({ ...loginDto, type: 'USER' as never });

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: loginDto.email, role: 'USER' },
        include: {
          adminRole: { select: { id: true, name: true } },
          influencer: { select: { id: true, isActive: true } },
        },
      });
    });

    it('throws UnauthorizedException when type is given but no matching account exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ ...loginDto, type: 'BEAUTICIAN' as never }),
      ).rejects.toThrow(
        new UnauthorizedException(
          'No beautician account exists for this email. Please register as a beautician first.',
        ),
      );
    });

    it('uses the legacy lookup when no type is provided', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException(ErrorMessages.INVALID_CREDENTIALS),
      );
    });
  });
});
