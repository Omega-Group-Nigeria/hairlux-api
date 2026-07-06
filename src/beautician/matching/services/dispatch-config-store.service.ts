import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DEFAULT_DISPATCH_REGION,
  DISPATCH_CONFIG_DEFAULTS,
  DispatchConfigValueType,
} from '../constants/dispatch-config.defaults';

export interface DispatchConfigEntry {
  key: string;
  value: string;
  valueType: DispatchConfigValueType;
}

@Injectable()
export class DispatchConfigStoreService implements OnModuleInit {
  private readonly logger = new Logger(DispatchConfigStoreService.name);
  private cache = new Map<string, DispatchConfigEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureDefaults(DEFAULT_DISPATCH_REGION);
    await this.reload(DEFAULT_DISPATCH_REGION);
  }

  async ensureDefaults(region = DEFAULT_DISPATCH_REGION) {
    for (const item of DISPATCH_CONFIG_DEFAULTS) {
      await this.prisma.dispatchConfig.upsert({
        where: { region_key: { region, key: item.key } },
        create: {
          region,
          key: item.key,
          value: item.value,
          valueType: item.valueType,
        },
        update: {},
      });
    }
  }

  async reload(region = DEFAULT_DISPATCH_REGION) {
    const rows = await this.prisma.dispatchConfig.findMany({
      where: { region },
    });

    this.cache.clear();
    for (const row of rows) {
      this.cache.set(row.key, {
        key: row.key,
        value: row.value,
        valueType: row.valueType as DispatchConfigValueType,
      });
    }

    this.logger.log(`Loaded ${rows.length} dispatch config entries for ${region}`);
  }

  getEntry(key: string): DispatchConfigEntry | undefined {
    return this.cache.get(key);
  }

  getAllEntries(): DispatchConfigEntry[] {
    return [...this.cache.values()];
  }

  async upsertEntries(
    region: string,
    entries: Array<{ key: string; value: string; valueType: DispatchConfigValueType }>,
  ) {
    for (const entry of entries) {
      await this.prisma.dispatchConfig.upsert({
        where: { region_key: { region, key: entry.key } },
        create: {
          region,
          key: entry.key,
          value: entry.value,
          valueType: entry.valueType,
        },
        update: {
          value: entry.value,
          valueType: entry.valueType,
        },
      });
    }

    await this.reload(region);
  }
}