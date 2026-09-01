import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreatePinDto } from './dto/create-pin.dto';
import { UpdatePinDto } from './dto/update-pin.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';

const PIN_CONFIG = {
  MIN_LENGTH: 4,
  MAX_LENGTH: 6,
  MAX_FAILED_ATTEMPTS: 5,
  LOCK_DURATION_MINUTES: 30,
};

@Injectable()
export class PinService {
  private readonly logger = new Logger(PinService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Set initial PIN for a user.
   * Requires current password as proof of ownership for the first PIN setup.
   */
  async createPin(userId: string, dto: CreatePinDto): Promise<void> {
    const { pin, confirmPin, password } = dto;

    this.validatePinFormat(pin);
    this.validatePinFormat(confirmPin);

    if (pin !== confirmPin) {
      throw new BadRequestException('PIN and confirmation do not match');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, pin: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.pin) {
      throw new BadRequestException(
        'PIN is already set. Use the update PIN endpoint to change it.',
      );
    }

    // Require password confirmation for initial PIN setup (security)
    if (!password) {
      throw new BadRequestException('Current password is required to set your initial PIN');
    }

    // A Google-signup account has no local password at all -- can't
    // confirm via password for a PIN setup. They'd need to set a password
    // first (via a separate flow) before PIN setup can use this method.
    if (!user.password) {
      throw new BadRequestException(
        'This account has no password set (it uses Google sign-in). Set a password first before setting a PIN.',
      );
    }

    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPin = await this.hashPin(pin);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pin: hashedPin,
        pinSetAt: new Date(),
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
    });

    // Clear any cached failed attempt counters
    await this.clearPinAttemptCache(userId);

    this.logger.log(`PIN created successfully for user ${userId}`);
  }

  /**
   * Verify the user's PIN.
   * Throws on invalid/locked. Resets failure count on success.
   * Uses Redis + DB for lockout protection.
   */
  async verifyPin(userId: string, dto: VerifyPinDto): Promise<{ verified: true }> {
    const { pin } = dto;

    this.validatePinFormat(pin);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        pin: true,
        pinLockedUntil: true,
        pinFailedAttempts: true,
        status: true,
      },
    });

    if (!user || !user.pin) {
      throw new BadRequestException('No PIN has been set for this account');
    }

    // Check lockout
    if (await this.isPinLocked(userId, user.pinLockedUntil)) {
      const lockUntil = user.pinLockedUntil?.toISOString();
      throw new UnauthorizedException(
        `PIN is temporarily locked due to too many failed attempts. Try again after ${lockUntil}`,
      );
    }

    const isPinValid = await argon2.verify(user.pin, pin);

    if (!isPinValid) {
      await this.handleFailedPinAttempt(userId, user.pinFailedAttempts ?? 0);
      throw new UnauthorizedException('Invalid PIN');
    }

    // Success — reset counters
    await this.resetPinFailedAttempts(userId);

    this.logger.log(`PIN verified successfully for user ${userId}`);

    return { verified: true };
  }

  /**
   * Update existing PIN. Requires current PIN.
   * On success, rotates credential and caller should usually issue new tokens.
   */
  async updatePin(userId: string, dto: UpdatePinDto): Promise<void> {
    const { currentPin, newPin, confirmNewPin } = dto;

    this.validatePinFormat(currentPin);
    this.validatePinFormat(newPin);
    this.validatePinFormat(confirmNewPin);

    if (newPin !== confirmNewPin) {
      throw new BadRequestException('New PIN and confirmation do not match');
    }

    if (currentPin === newPin) {
      throw new BadRequestException('New PIN must be different from current PIN');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, pin: true, pinLockedUntil: true, pinFailedAttempts: true },
    });

    if (!user || !user.pin) {
      throw new BadRequestException('No PIN has been set for this account');
    }

    // Check lockout before allowing change
    if (await this.isPinLocked(userId, user.pinLockedUntil)) {
      throw new UnauthorizedException(
        'PIN is temporarily locked due to too many failed attempts. Please try again later.',
      );
    }

    const isCurrentPinValid = await argon2.verify(user.pin, currentPin);

    if (!isCurrentPinValid) {
      await this.handleFailedPinAttempt(userId, user.pinFailedAttempts ?? 0);
      throw new UnauthorizedException('Current PIN is incorrect');
    }

    const hashedNewPin = await this.hashPin(newPin);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pin: hashedNewPin,
        pinSetAt: new Date(),
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
    });

    await this.clearPinAttemptCache(userId);

    this.logger.log(`PIN updated successfully for user ${userId}`);
  }

  /**
   * Returns whether the user has a PIN configured and lock status.
   */
  async getPinStatus(userId: string): Promise<{
    hasPin: boolean;
    isLocked: boolean;
    lockedUntil?: string | null;
    failedAttempts: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        pin: true,
        pinLockedUntil: true,
        pinFailedAttempts: true,
      },
    });

    if (!user) {
      return { hasPin: false, isLocked: false, failedAttempts: 0 };
    }

    const isLocked = await this.isPinLocked(userId, user.pinLockedUntil);

    return {
      hasPin: !!user.pin,
      isLocked,
      lockedUntil: user.pinLockedUntil?.toISOString() ?? null,
      failedAttempts: user.pinFailedAttempts ?? 0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private validatePinFormat(pin: string): void {
    if (!/^\d{4,6}$/.test(pin)) {
      throw new BadRequestException(
        `PIN must be ${PIN_CONFIG.MIN_LENGTH}-${PIN_CONFIG.MAX_LENGTH} numeric digits only`,
      );
    }
  }

  private async hashPin(pin: string): Promise<string> {
    return argon2.hash(pin, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
  }

  private async isPinLocked(
    userId: string,
    dbLockedUntil: Date | null,
  ): Promise<boolean> {
    if (dbLockedUntil && dbLockedUntil > new Date()) {
      return true;
    }

    // Check Redis for faster/more accurate short-term lock
    const redisLockKey = `pin:lock:${userId}`;
    const redisLock = await this.redis.get<string>(redisLockKey);
    return !!redisLock;
  }

  private async handleFailedPinAttempt(
    userId: string,
    currentAttempts: number,
  ): Promise<void> {
    const newAttempts = currentAttempts + 1;

    // Update DB count
    await this.prisma.user.update({
      where: { id: userId },
      data: { pinFailedAttempts: newAttempts },
    });

    // Also track in Redis for quick lock decisions
    const attemptsKey = `pin:attempts:${userId}`;
    await this.redis.set(attemptsKey, newAttempts, 3600); // 1 hour

    if (newAttempts >= PIN_CONFIG.MAX_FAILED_ATTEMPTS) {
      const lockUntil = new Date(
        Date.now() + PIN_CONFIG.LOCK_DURATION_MINUTES * 60 * 1000,
      );

      await this.prisma.user.update({
        where: { id: userId },
        data: { pinLockedUntil: lockUntil },
      });

      // Set Redis lock marker
      const lockKey = `pin:lock:${userId}`;
      await this.redis.set(
        lockKey,
        lockUntil.toISOString(),
        PIN_CONFIG.LOCK_DURATION_MINUTES * 60,
      );

      this.logger.warn(
        `PIN locked for user ${userId} after ${newAttempts} failed attempts until ${lockUntil.toISOString()}`,
      );
    }
  }

  private async resetPinFailedAttempts(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
    });

    await this.clearPinAttemptCache(userId);
  }

  private async clearPinAttemptCache(userId: string): Promise<void> {
    await Promise.all([
      this.redis.del(`pin:attempts:${userId}`),
      this.redis.del(`pin:lock:${userId}`),
    ]);
  }
}
