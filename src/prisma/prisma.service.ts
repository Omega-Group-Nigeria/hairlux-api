import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

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

  get serviceCommissionRate() {
    return this.client.serviceCommissionRate;
  }

  get beauticianCommissionRate() {
    return this.client.beauticianCommissionRate;
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

  get application() {
    return this.client.application;
  }

  get staffEmploymentHistory() {
    return this.client.staffEmploymentHistory;
  }

  get staffLocation() {
    return this.client.staffLocation;
  }

  get branchService() {
    return this.client.branchService;
  }

  get waitlistEntry() {
    return this.client.waitlistEntry;
  }

  get productCategory() {
    return this.client.productCategory;
  }

  get product() {
    return this.client.product;
  }

  get productImage() {
    return this.client.productImage;
  }

  get deliveryRegion() {
    return this.client.deliveryRegion;
  }

  get shopOrder() {
    return this.client.shopOrder;
  }

  get beauticianProfile() {
    return this.client.beauticianProfile;
  }

  get beauticianService() {
    return this.client.beauticianService;
  }

  get jobOffer() {
    return this.client.jobOffer;
  }

  get dispatchEvent() {
    return this.client.dispatchEvent;
  }

  get dispatchConfig() {
    return this.client.dispatchConfig;
  }

  get homeServiceSettings() {
    return this.client.homeServiceSettings;
  }

  get payoutRequest() {
    return this.client.payoutRequest;
  }

  get fcmToken() {
    return this.client.fcmToken;
  }

  get beauticianLocationHistory() {
    return this.client.beauticianLocationHistory;
  }

  get bookingCommsSession() {
    return this.client.bookingCommsSession;
  }

  get bookingCommsEvent() {
    return this.client.bookingCommsEvent;
  }

  get userRoleAssignment() {
    return this.client.userRoleAssignment;
  }

  get staffOnboardingItem() {
    return this.client.staffOnboardingItem;
  }

  get companyDocument() {
    return this.client.companyDocument;
  }

  get staffDocumentAcknowledgment() {
    return this.client.staffDocumentAcknowledgment;
  }

  get announcement() {
    return this.client.announcement;
  }

  get announcementRead() {
    return this.client.announcementRead;
  }

  get directive() {
    return this.client.directive;
  }

  get attendanceRecord() {
    return this.client.attendanceRecord;
  }

  get inventoryLogEntry() {
    return this.client.inventoryLogEntry;
  }

  get employmentApproval() {
    return this.client.employmentApproval;
  }

  get offerLetter() {
    return this.client.offerLetter;
  }

  get leaveRequest() {
    return this.client.leaveRequest;
  }

  get approvalRequest() {
    return this.client.approvalRequest;
  }

  get approvalAction() {
    return this.client.approvalAction;
  }

  get disciplinaryAction() {
    return this.client.disciplinaryAction;
  }
  get stockAdjustmentRequest() {
    return this.client.stockAdjustmentRequest;
  }

  get salonBooking() {
    return this.client.salonBooking;
  }

  get salonBookingService() {
    return this.client.salonBookingService;
  }

  get salonBookingInventoryItem() {
    return this.client.salonBookingInventoryItem;
  }

  get salonBookingCommission() {
    return this.client.salonBookingCommission;
  }

  get customer() {
    return this.client.customer;
  }

  get staffCodeHistory() {
    return this.client.staffCodeHistory;
  }

  get expiryAlert() {
    return this.client.expiryAlert;
  }

  get productSale() {
    return this.client.productSale;
  }

  get productSaleItem() {
    return this.client.productSaleItem;
  }

  get latePenaltySettings() {
    return this.client.latePenaltySettings;
  }

  get supplier() {
    return this.client.supplier;
  }

  get staffBankAccount() {
    return this.client.staffBankAccount;
  }

  get staffCompensationHistory() {
    return this.client.staffCompensationHistory;
  }

  get payrollPeriod() {
    return this.client.payrollPeriod;
  }

  get payslip() {
    return this.client.payslip;
  }

  get payrollAdjustment() {
    return this.client.payrollAdjustment;
  }

  get staffWallet() {
    return this.client.staffWallet;
  }

  get staffWalletTransaction() {
    return this.client.staffWalletTransaction;
  }

  get staffPayoutRequest() {
    return this.client.staffPayoutRequest;
  }

  get payrollSettings() {
    return this.client.payrollSettings;
  }

  get ninVerificationAttempt() {
    return this.client.ninVerificationAttempt;
  }

  get userAdminRole() {
    return this.client.userAdminRole;
  }

  get roleAuditLog() {
    return this.client.roleAuditLog;
  }

  get jobPostingBranch() {
    return this.client.jobPostingBranch;
  }

  get $transaction() {
    return this.client.$transaction.bind(this.client);
  }

  get inventoryItem() {
    return this.client.inventoryItem;
  }

  get stockMovement() {
    return this.client.stockMovement;
  }

  get lowStockAlert() {
    return this.client.lowStockAlert;
  }

  get stockTransfer() {
    return this.client.stockTransfer;
  }



}
