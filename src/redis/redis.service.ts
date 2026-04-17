import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  client: Redis;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    this.client = redisUrl
      ? new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: null,
          enableOfflineQueue: false,
          retryStrategy: (times) => {
            if (times > 3) return null; // give up — don't hang requests
            return Math.min(times * 200, 1000);
          },
        })
      : new Redis({
          host: this.configService.get<string>('REDIS_HOST', 'localhost'),
          port: this.configService.get<number>('REDIS_PORT', 6379),
          password: this.configService.get<string>('REDIS_PASSWORD'),
          lazyConnect: true,
          maxRetriesPerRequest: null,
          enableOfflineQueue: false,
          retryStrategy: (times) => {
            if (times > 3) return null;
            return Math.min(times * 200, 1000);
          },
        });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) =>
      this.logger.error(`Redis error: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (err) {
      this.logger.warn(
        `Cache GET failed for key "${key}": ${(err as Error).message}`,
      );
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(
        `Cache SET failed for key "${key}": ${(err as Error).message}`,
      );
    }
  }

  async del(...keys: string[]): Promise<void> {
    try {
      if (keys.length) await this.client.del(...keys);
    } catch (err) {
      this.logger.warn(`Cache DEL failed: ${(err as Error).message}`);
    }
  }

  /**
   * Delete all keys matching a glob pattern using non-blocking SCAN.
   * Example: delByPattern('services:*') deletes all service cache entries.
   */
  async delByPattern(pattern: string): Promise<void> {
    try {
      const keys: string[] = [];
      const stream = this.client.scanStream({ match: pattern, count: 100 });

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (batch: string[]) => keys.push(...batch));
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      if (keys.length) {
        // Pipeline DEL in chunks to avoid huge single command
        const chunkSize = 100;
        for (let i = 0; i < keys.length; i += chunkSize) {
          await this.client.del(...keys.slice(i, i + chunkSize));
        }
      }
    } catch (err) {
      this.logger.warn(
        `Cache DEL pattern "${pattern}" failed: ${(err as Error).message}`,
      );
    }
  }
}
