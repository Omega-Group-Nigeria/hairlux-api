import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public client: PrismaClient;
  private pool: Pool;

  constructor(private configService: ConfigService) {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: isProduction ? { rejectUnauthorized: false } : undefined,
    });
    const adapter = new PrismaPg(this.pool);

    this.client = new PrismaClient({
      adapter,
      log: isProduction
        ? ['warn', 'error']
        : ['query', 'info', 'warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
    await this.pool.end();
  }

  // Proxy all PrismaClient properties
  get user() {
    return this.client.user;
  }

  get refreshToken() {
    return this.client.refreshToken;
  }

  get address() {
    return this.client.address;
  }

  get serviceCategory() {
    return this.client.serviceCategory;
  }

  get service() {
    return this.client.service;
  }

  get booking() {
    return this.client.booking;
  }

  get wallet() {
    return this.client.wallet;
  }

  get transaction() {
    return this.client.transaction;
  }

  get review() {
    return this.client.review;
  }

  get businessSettings() {
    return this.client.businessSettings;
  }

  get businessHours() {
    return this.client.businessHours;
  }

  get businessException() {
    return this.client.businessException;
  }

  get discountCode() {
    return this.client.discountCode;
  }

  get referralSettings() {
    return this.client.referralSettings;
  }

  get referralCode() {
    return this.client.referralCode;
  }

  get referral() {
    return this.client.referral;
  }

  get referralCampaignCode() {
    return this.client.referralCampaignCode;
  }

  get referralCampaignCodeUsage() {
    return this.client.referralCampaignCodeUsage;
  }

  get discountUsage() {
    return this.client.discountUsage;
  }

  get influencerRewardSettings() {
    return this.client.influencerRewardSettings;
  }

  get influencerReward() {
    return this.client.influencerReward;
  }

  get influencer() {
    return this.client.influencer;
  }

  get jobPosting() {
    return this.client.jobPosting;
  }

  get adminRole() {
    return this.client.adminRole;
  }

  get adminRolePermission() {
    return this.client.adminRolePermission;
  }

  get staff() {
    return this.client.staff;
  }

  get staffEmploymentHistory() {
    return this.client.staffEmploymentHistory;
  }

  get staffLocation() {
    return this.client.staffLocation;
  }

  get $transaction() {
    return this.client.$transaction.bind(this.client);
  }
}
