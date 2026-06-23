import { Injectable, Logger } from '@nestjs/common';
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

export interface PaystackTransferResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    transfer_code: string;
    status: string;
    amount: number;
  };
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
      throw new Error('Failed to initialize payment with Paystack');
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
      throw new Error('Failed to verify payment with Paystack');
    }
  }

  /**
   * Verifies the x-paystack-signature header using HMAC-SHA512.
   * Paystack signs the raw request body with the secret key.
   */
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to resolve account number: ${errorMessage}`);
      throw new Error('Failed to resolve bank account with Paystack');
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create transfer recipient: ${errorMessage}`);
      throw new Error('Failed to create Paystack transfer recipient');
    }
  }

  async initiateTransfer(input: {
    amount: number;
    recipientCode: string;
    reference: string;
    reason?: string;
  }): Promise<PaystackTransferResponse['data']> {
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initiate transfer: ${errorMessage}`);
      throw new Error('Failed to initiate Paystack transfer');
    }
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
