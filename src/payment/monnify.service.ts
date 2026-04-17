import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash } from 'crypto';

export interface MonnifyInitResponse {
  requestSuccessful: boolean;
  responseMessage: string;
  responseBody: {
    transactionReference: string;
    paymentReference: string;
    merchantName: string;
    apiKey: string;
    enabledPaymentMethod: string[];
    checkoutUrl: string;
  };
}

export interface MonnifyVerifyResponse {
  requestSuccessful: boolean;
  responseMessage: string;
  responseBody: {
    transactionReference: string;
    paymentReference: string;
    amountPaid: number | string;
    totalPayable: number | string;
    settledAmount: number | string;
    paidOn: string;
    paymentStatus: string; // 'PAID' | 'FAILED' | 'PENDING' | 'OVERPAID' | 'PARTIALLY_PAID'
    customer: { email: string; name: string };
  };
}

@Injectable()
export class MonnifyService {
  private readonly logger = new Logger(MonnifyService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly contractCode: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'MONNIFY_BASE_URL',
      'https://sandbox.monnify.com',
    );
    this.apiKey = this.configService.get<string>('MONNIFY_API_KEY') || '';
    this.secretKey = this.configService.get<string>('MONNIFY_SECRET_KEY') || '';
    this.contractCode =
      this.configService.get<string>('MONNIFY_CONTRACT_CODE') || '';
  }

  private getBasicAuthHeader(): string {
    const credentials = Buffer.from(
      `${this.apiKey}:${this.secretKey}`,
    ).toString('base64');
    return `Basic ${credentials}`;
  }

  async getAccessToken(): Promise<string> {
    const response = await axios.post<{
      requestSuccessful: boolean;
      responseBody: { accessToken: string };
    }>(
      `${this.baseUrl}/api/v1/auth/login`,
      {},
      { headers: { Authorization: this.getBasicAuthHeader() } },
    );
    return response.data.responseBody.accessToken;
  }

  async initializePayment(
    email: string,
    amount: number,
    reference: string,
    customerName: string,
  ): Promise<MonnifyInitResponse> {
    try {
      const token = await this.getAccessToken();
      const response = await axios.post<MonnifyInitResponse>(
        `${this.baseUrl}/api/v1/merchant/transactions/init-transaction`,
        {
          amount,
          customerName,
          customerEmail: email,
          paymentReference: reference,
          paymentDescription: 'Wallet Deposit',
          currencyCode: 'NGN',
          contractCode: this.contractCode,
          redirectUrl: this.configService.get<string>('MONNIFY_REDIRECT_URL'),
          paymentMethods: ['CARD', 'ACCOUNT_TRANSFER'],
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      this.logger.log(`Monnify payment initialized: ${reference}`);
      return response.data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to initialize Monnify payment:', msg);
      throw new Error('Failed to initialize payment with Monnify');
    }
  }

  async verifyPayment(
    transactionReference: string,
  ): Promise<MonnifyVerifyResponse> {
    try {
      const token = await this.getAccessToken();
      const encoded = encodeURIComponent(transactionReference);
      const response = await axios.get<MonnifyVerifyResponse>(
        `${this.baseUrl}/api/v2/transactions/${encoded}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      this.logger.log(`Monnify payment verified: ${transactionReference}`);
      return response.data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to verify Monnify payment:', msg);
      throw new Error('Failed to verify payment with Monnify');
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const normalizedSignature = signature.trim().toLowerCase();

    const computedRaw = createHash('sha512')
      .update(`${this.secretKey}${rawBody}`)
      .digest('hex');

    if (computedRaw === normalizedSignature) {
      return true;
    }

    // Fallback: normalize JSON formatting before hashing to avoid false negatives
    // when whitespace/serialization differs across intermediaries.
    try {
      const normalizedBody = JSON.stringify(JSON.parse(rawBody));
      const computedNormalized = createHash('sha512')
        .update(`${this.secretKey}${normalizedBody}`)
        .digest('hex');
      return computedNormalized === normalizedSignature;
    } catch {
      return false;
    }
  }
}
