import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayoutRequestStatus } from '@prisma/client';
import { PaystackPayoutTransferService } from './paystack-payout-transfer.service';

describe('PaystackPayoutTransferService', () => {
  let service: PaystackPayoutTransferService;

  const mockPaystack = {
    initiateTransfer: jest.fn(),
    finalizeTransfer: jest.fn(),
    isTransferSuccessStatus: jest.fn((status: string) => status === 'success'),
    isTransferFailureStatus: jest.fn((status: string) => status === 'failed'),
    isTransferAwaitingApproval: jest.fn(),
  };

  const mockBankAccount = {
    getPayoutDestination: jest.fn(async () => ({
      bankCode: '058',
      accountNumber: '0123456789',
      accountName: 'ADA OKAFOR',
      recipientCode: 'RCP_test',
    })),
  };

  const mockSettlement = {
    completeTransfer: jest.fn(),
    rejectTransfer: jest.fn(),
  };

  const payoutRequest = {
    id: 'payout-1',
    userId: 'beautician-1',
    amount: 5000,
    status: PayoutRequestStatus.PENDING,
    bankCode: '058',
    accountNumber: '0123456789',
    accountName: 'ADA OKAFOR',
    processedById: null,
    paystackTransferReference: null,
    paystackTransferCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    rejectionReason: null,
    transactionId: null,
    processedAt: null,
  };

  const mockPrisma = {
    wallet: {
      findUnique: jest.fn(async () => ({ id: 'wallet-1', balance: 10000 })),
    },
    payoutRequest: {
      aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        ...payoutRequest,
        ...args.data,
        id: 'payout-new',
      })),
      update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        ...payoutRequest,
        ...args.data,
        id: args.where.id,
      })),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaystackPayoutTransferService(
      mockPrisma as never,
      mockPaystack as never,
      mockBankAccount as never,
      mockSettlement as never,
    );
  });

  it('initiates a Paystack transfer and completes immediately on success', async () => {
    mockPaystack.initiateTransfer.mockResolvedValueOnce({
      reference: 'PSTK-TRF-abc',
      transfer_code: 'TRF_abc',
      status: 'success',
      amount: 500000,
    });

    const result = await service.initiateForUser('beautician-1', {
      amount: 5000,
      bankCode: '058',
      accountNumber: '0123456789',
      accountName: 'ADA OKAFOR',
      recipientCode: 'RCP_test',
    });

    expect(mockPaystack.initiateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        recipientCode: 'RCP_test',
      }),
    );
    expect(mockSettlement.completeTransfer).toHaveBeenCalled();
    expect(result.status).toBe(PayoutRequestStatus.COMPLETED);
    expect(result.requiresApproval).toBe(false);
  });

  it('returns awaiting approval when Paystack transfer is pending', async () => {
    mockPaystack.initiateTransfer.mockResolvedValueOnce({
      reference: 'PSTK-TRF-pending',
      transfer_code: 'TRF_pending',
      status: 'pending',
      amount: 500000,
    });

    const result = await service.initiateForUser('beautician-1', {
      amount: 5000,
      bankCode: '058',
      accountNumber: '0123456789',
      accountName: 'ADA OKAFOR',
      recipientCode: 'RCP_test',
    });

    expect(result.status).toBe(PayoutRequestStatus.PROCESSING);
    expect(result.requiresApproval).toBe(true);
    expect(mockSettlement.completeTransfer).not.toHaveBeenCalled();
  });

  it('processes a pending payout request via Paystack', async () => {
    mockPrisma.payoutRequest.findUnique.mockResolvedValueOnce(payoutRequest);
    mockPrisma.payoutRequest.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } });
    mockPaystack.initiateTransfer.mockResolvedValueOnce({
      reference: 'PSTK-TRF-admin',
      transfer_code: 'TRF_admin',
      status: 'pending',
      amount: 500000,
    });

    const result = await service.processPendingRequest('payout-1', 'admin-1');

    expect(mockBankAccount.getPayoutDestination).toHaveBeenCalledWith('beautician-1');
    expect(result.requiresApproval).toBe(true);
  });

  it('approves a processing payout transfer', async () => {
    mockPrisma.payoutRequest.findUnique.mockResolvedValueOnce({
      ...payoutRequest,
      status: PayoutRequestStatus.PROCESSING,
      paystackTransferReference: 'PSTK-TRF-approve',
      paystackTransferCode: 'TRF_approve',
    });
    mockPaystack.finalizeTransfer.mockResolvedValueOnce({
      reference: 'PSTK-TRF-approve',
      transfer_code: 'TRF_approve',
      status: 'success',
      amount: 500000,
    });

    const result = await service.approveTransfer('payout-1', 'admin-1', '123456');

    expect(mockPaystack.finalizeTransfer).toHaveBeenCalledWith({
      transferCode: 'TRF_approve',
      otp: '123456',
    });
    expect(mockSettlement.completeTransfer).toHaveBeenCalled();
    expect(result.status).toBe(PayoutRequestStatus.COMPLETED);
  });

  it('rejects approval when payout is not processing', async () => {
    mockPrisma.payoutRequest.findUnique.mockResolvedValueOnce({
      ...payoutRequest,
      status: PayoutRequestStatus.PENDING,
    });

    await expect(
      service.approveTransfer('payout-1', 'admin-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when pending payout request is missing', async () => {
    mockPrisma.payoutRequest.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.processPendingRequest('missing', 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });
});