import { PayoutRequestStatus } from '@prisma/client';
import { PaystackTransferApprovalService } from './paystack-transfer-approval.service';

describe('PaystackTransferApprovalService', () => {
  let service: PaystackTransferApprovalService;

  const mockPrisma = {
    payoutRequest: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaystackTransferApprovalService(mockPrisma as never);
  });

  it('approves when reference and amount match a processing payout', async () => {
    mockPrisma.payoutRequest.findUnique.mockResolvedValueOnce({
      id: 'payout-1',
      status: PayoutRequestStatus.PROCESSING,
      amount: 5000,
    });

    const approved = await service.validateTransferApproval({
      reference: 'PSTK-TRF-abc',
      amount: 500000,
    });

    expect(approved).toBe(true);
  });

  it('rejects unknown transfer reference', async () => {
    mockPrisma.payoutRequest.findUnique.mockResolvedValueOnce(null);

    const approved = await service.validateTransferApproval({
      reference: 'PSTK-TRF-unknown',
      amount: 500000,
    });

    expect(approved).toBe(false);
  });

  it('rejects when amount does not match payout request', async () => {
    mockPrisma.payoutRequest.findUnique.mockResolvedValueOnce({
      id: 'payout-1',
      status: PayoutRequestStatus.PROCESSING,
      amount: 5000,
    });

    const approved = await service.validateTransferApproval({
      reference: 'PSTK-TRF-abc',
      amount: 100000,
    });

    expect(approved).toBe(false);
  });
});