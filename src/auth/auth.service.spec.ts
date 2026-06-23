import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ReferralService } from '../referral/referral.service';
import { RedisService } from '../redis/redis.service';
import { PinService } from './pin.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    wallet: { create: jest.fn() },
    beauticianProfile: { create: jest.fn() },
    refreshToken: { create: jest.fn(), deleteMany: jest.fn() },
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
    };

    it('creates user with BEAUTICIAN role, wallet, and beautician profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const createdUser = {
        id: 'user-uuid',
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        phone: registerDto.phone,
        role: UserRole.BEAUTICIAN,
        status: UserStatus.ACTIVE,
        emailVerified: false,
        createdAt: new Date(),
      };

      mockPrisma.$transaction.mockImplementation(async (arg) => {
        if (typeof arg === 'function') {
          return arg({
            user: {
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

      mockPrisma.user.update.mockResolvedValue(createdUser);

      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      mockRedis.del.mockResolvedValue(1);

      const result = await service.registerBeautician(registerDto);

      expect(result.user.role).toBe(UserRole.BEAUTICIAN);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockMailService.sendOtpEmail).toHaveBeenCalledWith(
        createdUser.email,
        expect.any(String),
        createdUser.firstName,
      );
    });

    it('throws ConflictException when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.registerBeautician(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});