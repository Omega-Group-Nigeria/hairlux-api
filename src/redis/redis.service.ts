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

  async setNx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    try {
      const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (err) {
      this.logger.warn(
        `Cache SET NX failed for key "${key}": ${(err as Error).message}`,
      );
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (err) {
      this.logger.warn(
        `Cache INCR failed for key "${key}": ${(err as Error).message}`,
      );
      return 0;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.expire(key, ttlSeconds);
    } catch (err) {
      this.logger.warn(
        `Cache EXPIRE failed for key "${key}": ${(err as Error).message}`,
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
  async geoAdd(
    key: string,
    longitude: number,
    latitude: number,
    member: string,
  ): Promise<void> {
    try {
      await this.client.geoadd(key, longitude, latitude, member);
    } catch (err) {
      this.logger.warn(
        `GEOADD failed for key "${key}": ${(err as Error).message}`,
      );
    }
  }

  async geoRemove(key: string, member: string): Promise<void> {
    try {
      await this.client.zrem(key, member);
    } catch (err) {
      this.logger.warn(
        `ZREM failed for key "${key}": ${(err as Error).message}`,
      );
    }
  }

  async geoSearchByRadius(
    key: string,
    longitude: number,
    latitude: number,
    radiusKm: number,
    count = 20,
  ): Promise<Array<{ member: string; distanceKm: number }>> {
    try {
      const results = (await this.client.georadius(
        key,
        longitude,
        latitude,
        radiusKm,
        'km',
        'WITHDIST',
        'ASC',
        'COUNT',
        count,
      )) as Array<[string, string]>;

      return results.map(([member, distance]) => ({
        member,
        distanceKm: Number(distance),
      }));
    } catch (err) {
      this.logger.warn(
        `GEORADIUS failed for key "${key}": ${(err as Error).message}`,
      );
      return [];
    }
  }

  async hset(key: string, fields: Record<string, string>): Promise<void> {
    try {
      if (Object.keys(fields).length) {
        await this.client.hset(key, fields);
      }
    } catch (err) {
      this.logger.warn(
        `HSET failed for key "${key}": ${(err as Error).message}`,
      );
    }
  }

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
