import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { MailModule } from './mail/mail.module';
import { SmsModule } from './sms/sms.module';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module';
import { PaymentModule } from './payment/payment.module';
import { BookingModule } from './booking/booking.module';
import { WalletModule } from './wallet/wallet.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DiscountModule } from './discount/discount.module';
import { ReferralModule } from './referral/referral.module';
import { InfluencerModule } from './influencer/influencer.module';
import { RedisModule } from './redis/redis.module';
import { JobsModule } from './jobs/jobs.module';
import { RolesModule } from './roles/roles.module';
import { StaffModule } from './staff/staff.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { ShopModule } from './shop/shop.module';
import { BranchModule } from './branch/branch.module';
import { CommonModule } from './common/common.module';
import { BeauticianModule } from './beautician/beautician.module';
import { CommsModule } from './comms/comms.module';
import { NinModule } from './nin/nin.module';
import { ApplicationModule } from './application/application.module';
import { StorageModule } from './storage/storage.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';
import { InventoryModule } from './inventory/inventory.module';
import { BranchFinanceModule } from './branch-finance/branch-finance.module';
import { SalonBookingModule } from './salon-booking/salon-booking.module';
import { ProductSaleModule } from './product-sale/product-sale.module';
import { SupplierModule } from './supplier/supplier.module';
import { PayrollModule } from './payroll/payroll.module';
import { CrmModule } from './crm/crm.module';
import { LmsModule } from './lms/lms.module';
import { InventoryProductModule } from './inventory-product/inventory-product.module';
import { FinanceModule } from './finance/finance.module';
import { PurchaseModule } from './purchase/purchase.module';
import { ReportsModule } from './reports/reports.module';
import { SiteStatsModule } from './site-stats/site-stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');

        if (redisUrl) {
          const parsed = new URL(redisUrl);
          const dbPart = parsed.pathname?.replace('/', '');
          const parsedDb = dbPart ? Number(dbPart) : undefined;

          return {
            redis: {
              host: parsed.hostname,
              port: parsed.port ? Number(parsed.port) : 6379,
              password: parsed.password
                ? decodeURIComponent(parsed.password)
                : undefined,
              db: Number.isFinite(parsedDb) ? parsedDb : undefined,
              ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
            },
          };
        }

        return {
          redis: {
            host: configService.get('REDIS_HOST', 'localhost'),
            port: configService.get('REDIS_PORT', 6379),
            password: configService.get('REDIS_PASSWORD'),
          },
        };
      },
    }),
    PrismaModule,
    RedisModule,
    MailModule,
    SmsModule,
    AuthModule,
    UserModule,
    ServiceCatalogModule,
    PaymentModule,
    BookingModule,
    WalletModule,
    AnalyticsModule,
    DiscountModule,
    ReferralModule,
    InfluencerModule,
    JobsModule,
    RolesModule,
    StaffModule,
    LmsModule,
    WaitlistModule,
    ShopModule,
    BranchModule,
    CommonModule,
    BeauticianModule,
    CommsModule,
    NinModule,
    ApplicationModule,
    StorageModule,
    AttendanceModule,
    CrmModule,
    LeaveModule,
    InventoryModule,
    BranchFinanceModule,
    SalonBookingModule,
    ProductSaleModule,
    ProductSaleModule,
    SupplierModule,
    PayrollModule,
    BranchFinanceModule,
    SmsModule,
    CrmModule,
    LmsModule,
    InventoryProductModule,
    FinanceModule,
    PurchaseModule,
    ReportsModule,
    SiteStatsModule,

  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    },
  ],
})
export class AppModule { }