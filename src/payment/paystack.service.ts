import { BadRequestException, Injectable, Logger } from '@nestjs/common'; 
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import axios from 'axios';

export interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    amount: number;
    status: string;
    paid_at: string;
    customer: {
      email: string;
    };
  };
}

export interface PaystackResolveAccountResponse {
  status: boolean;
  message: string;
  data: {
    account_number: string;
    account_name: string;
    bank_id: number;
  };
}

export interface PaystackBankRecord {
  id: number;
  name: string;
  slug: string;
  code: string;
  longcode: string;
  active: boolean;
  is_deleted: boolean;
  currency: string;
}

export interface PaystackListBanksResponse {
  status: boolean;
  message: string;
  data: PaystackBankRecord[];
}

export interface PaystackBankSummary {
  code: string;
  name: string;
  slug: string;
}

export interface PaystackTransferRecipientResponse {
  status: boolean;
  message: string;
  data: {
    recipient_code: string;
    name: string;
    details: {
      account_number: string;
      bank_code: string;
    };
  };
}

export interface PaystackTransferData {
  reference: string;
  transfer_code: string;
  status: string;
  amount: number;
}

export interface PaystackTransferResponse {
  status: boolean;
  message: string;
  data: PaystackTransferData;
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly secretKey: string;

  constructor(private configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
  }

  async initializePayment(
    email: string,
    amount: number,
    reference: string,
    metadata?: Record<string, unknown>,
  ): Promise<PaystackInitializeResponse> {
    try {
      const response = await axios.post<PaystackInitializeResponse>(
        `${this.baseUrl}/transaction/initialize`,
        {
          email,
          amount: amount * 100, // Convert to kobo
          reference,
          metadata,
          callback_url: this.configService.get<string>('PAYSTACK_CALLBACK_URL'),
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`Payment initialized for ${email}: ${reference}`);
      return response.data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize payment:`, errorMessage);
      throw new BadRequestException('Failed to initialize payment with Paystack');
    }
  }

  async verifyPayment(reference: string): Promise<PaystackVerifyResponse> {
    try {
      const response = await axios.get<PaystackVerifyResponse>(
        `${this.baseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      this.logger.log(`Payment verified: ${reference}`);
      return response.data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to verify payment:`, errorMessage);
      throw new BadRequestException('Failed to verify payment with Paystack');
    }
  }

  async listBanks(currency = 'NGN'): Promise<PaystackBankSummary[]> {
    try {
      const response = await axios.get<PaystackListBanksResponse>(
        `${this.baseUrl}/bank`,
        {
          params: {
            currency,
            perPage: 100,
          },
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      if (!response.data.status) {
        throw new Error(response.data.message || 'Bank list fetch failed');
      }

      return response.data.data
        .filter((bank) => bank.active && !bank.is_deleted)
        .map((bank) => ({
          code: bank.code,
          name: bank.name,
          slug: bank.slug,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      const errorMessage = this.extractPaystackError(
        error,
        'Failed to fetch bank list from Paystack',
      );
      this.logger.error(`Failed to list banks: ${errorMessage}`);
      throw new BadRequestException(errorMessage);
    }
  }

  async resolveAccountNumber(
    accountNumber: string,
    bankCode: string,
  ): Promise<PaystackResolveAccountResponse['data']> {
    try {
      const response = await axios.get<PaystackResolveAccountResponse>(
        `${this.baseUrl}/bank/resolve`,
        {
          params: {
            account_number: accountNumber,
            bank_code: bankCode,
          },
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      if (!response.data.status) {
        throw new Error(response.data.message || 'Account resolution failed');
      }

      return response.data.data;
    } catch (error) {
      // Dev Feedback Round 9: this used to throw a plain Error, which
      // NestJS's default exception filter turns into an opaque 500
      // "Internal Server Error" with none of the actual reason attached
      // -- the single most common real-world trigger being a genuinely
      // wrong/non-existent account number, which is a normal user-input
      // situation, not a server fault. BadRequestException surfaces
      // Paystack's own message (e.g. "Could not resolve account name")
      // as a proper 400 the frontend can actually display.
      const errorMessage = this.extractPaystackError(
        error,
        'Failed to resolve bank account with Paystack',
      );
      this.logger.error(`Failed to resolve account number: ${errorMessage}`);
      throw new BadRequestException("Could not verify account, please try again, or try account bank.");
    }
  }

  async createTransferRecipient(input: {
    name: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<PaystackTransferRecipientResponse['data']> {
    try {
      const response = await axios.post<PaystackTransferRecipientResponse>(
        `${this.baseUrl}/transferrecipient`,
        {
          type: 'nuban',
          name: input.name,
          account_number: input.accountNumber,
          bank_code: input.bankCode,
          currency: 'NGN',
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.data.status) {
        throw new Error(response.data.message || 'Recipient creation failed');
      }

      return response.data.data;
    } catch (error) {
      // Dev Feedback Round 9: same fix as resolveAccountNumber above --
      // was a plain Error (opaque 500), and discarded Paystack's actual
      // message in favor of a generic one. Both fixed.
      const errorMessage = this.extractPaystackError(
        error,
        'Failed to create Paystack transfer recipient',
      );
      this.logger.error(`Failed to create transfer recipient: ${errorMessage}`);
      throw new BadRequestException(errorMessage);
    }
  }

  async initiateTransfer(input: {
    amount: number;
    recipientCode: string;
    reference: string;
    reason?: string;
  }): Promise<PaystackTransferData> {
    try {
      const response = await axios.post<PaystackTransferResponse>(
        `${this.baseUrl}/transfer`,
        {
          source: 'balance',
          amount: Math.round(input.amount * 100),
          recipient: input.recipientCode,
          reference: input.reference,
          reason: input.reason ?? 'HairLux beautician payout',
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.data.status) {
        throw new Error(response.data.message || 'Transfer initiation failed');
      }

      this.logger.log(`Transfer initiated: ${input.reference}`);
      return response.data.data;
    } catch (error) {
      const errorMessage = this.extractPaystackError(
        error,
        'Failed to initiate Paystack transfer',
      );
      this.logger.error(`Failed to initiate transfer: ${errorMessage}`);
      throw new BadRequestException(errorMessage);
    }
  }

  async finalizeTransfer(input: {
    transferCode: string;
    otp?: string;
  }): Promise<PaystackTransferData> {
    try {
      const response = await axios.post<PaystackTransferResponse>(
        `${this.baseUrl}/transfer/finalize_transfer`,
        {
          transfer_code: input.transferCode,
          ...(input.otp ? { otp: input.otp } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.data.status) {
        throw new Error(response.data.message || 'Transfer finalization failed');
      }

      this.logger.log(`Transfer finalized: ${input.transferCode}`);
      return response.data.data;
    } catch (error) {
      const errorMessage = this.extractPaystackError(
        error,
        'Failed to finalize Paystack transfer',
      );
      this.logger.error(`Failed to finalize transfer: ${errorMessage}`);
      throw new BadRequestException(errorMessage);
    }
  }

  /**
 * Fetch a transfer's current status directly from Paystack (GET
 * /transfer/:id_or_code) -- used for admin manual reconciliation of a
 * request that's stuck locally (e.g. our webhook delivery never
 * arrived), so the resync trusts Paystack's live state rather than
 * anything already stored on our side.
 */
  async getTransferStatus(transferCodeOrId: string): Promise<string> {
    try {
      const response = await axios.get<PaystackTransferResponse>(
        `${this.baseUrl}/transfer/${transferCodeOrId}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      if (!response.data.status) {
        throw new Error(response.data.message || 'Transfer status fetch failed');
      }

      return response.data.data.status;
    } catch (error) {
      const errorMessage = this.extractPaystackError(
        error,
        'Failed to fetch transfer status from Paystack',
      );
      this.logger.error(`Failed to fetch transfer status: ${errorMessage}`);
      throw new BadRequestException(errorMessage);
    }
  }

  isTransferSuccessStatus(status: string): boolean {
    return status.toLowerCase() === 'success';
  }

  isTransferFailureStatus(status: string): boolean {
    const normalized = status.toLowerCase();
    return normalized === 'failed' || normalized === 'reversed';
  }

  isTransferAwaitingApproval(status: string): boolean {
    const normalized = status.toLowerCase();
    return normalized === 'pending' || normalized === 'otp';
  }

  private extractPaystackError(error: unknown, fallback: string): string {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    return fallback;
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!signature || !this.secretKey || !rawBody) {
      return false;
    }
    try {
      const expected = createHmac('sha512', this.secretKey)
        .update(rawBody)
        .digest('hex');
      const expectedBuf = Buffer.from(expected, 'utf8');
      const receivedBuf = Buffer.from(signature.trim().toLowerCase(), 'utf8');
      if (expectedBuf.length !== receivedBuf.length) {
        return false;
      }
      return timingSafeEqual(expectedBuf, receivedBuf);
    } catch {
      return false;
    }
  }
}
