import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { InitializeDepositDto } from './dto/initialize-deposit.dto';
import { VerifyDepositDto } from './dto/verify-deposit.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { InjectQueue } from '@nestjs/bull';
import { MonnifyService } from '../payment/monnify.service';
import type { Queue } from 'bull';
import type { Request } from 'express';

@ApiTags('Wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly monnifyService: MonnifyService,
    @InjectQueue('paystack-webhooks') private webhookQueue: Queue,
    @InjectQueue('monnify-webhooks') private monnifyWebhookQueue: Queue,
  ) {}

  @Get('balance')
  @ApiOperation({
    summary: 'Get wallet balance',
    description: 'Retrieve current wallet balance for authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Balance retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Balance retrieved successfully',
        data: {
          balance: 25000,
          currency: 'NGN',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getBalance(@GetUser('id') userId: string) {
    const balance = await this.walletService.getBalance(userId);
    return {
      success: true,
      message: 'Balance retrieved successfully',
      data: balance,
    };
  }

  @Get('transactions')
  @ApiOperation({
    summary: 'Get transaction history',
    description: 'Retrieve paginated transaction history with optional filters',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (default: 20, max: 100)',
    example: 20,
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['DEPOSIT', 'DEBIT', 'CREDIT', 'REFUND'],
    description: 'Filter by transaction type',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'COMPLETED', 'FAILED'],
    description: 'Filter by transaction status',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
    schema: {
      example: {
        success: true,
        message: 'Transactions retrieved successfully',
        data: {
          transactions: [
            {
              id: '123e4567-e89b-12d3-a456-426614174000',
              amount: 5000,
              type: 'DEPOSIT',
              status: 'COMPLETED',
              description: 'Wallet deposit of ₦5000',
              paymentMethod: 'PAYSTACK',
              reference: 'WALLET-PSTK-1234567890-abc',
              createdAt: '2026-02-17T10:00:00.000Z',
            },
          ],
          pagination: {
            page: 1,
            limit: 20,
            total: 1,
            totalPages: 1,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTransactions(
    @GetUser('id') userId: string,
    @Query() query: GetTransactionsDto,
  ) {
    const result = await this.walletService.getTransactions(userId, query);
    return {
      success: true,
      message: 'Transactions retrieved successfully',
      data: result,
    };
  }

  @Post('deposit/initialize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initialize wallet deposit',
    description:
      'Initialize wallet deposit with Paystack or Monnify. Returns checkout URL for selected gateway.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deposit initialized successfully',
    schema: {
      example: {
        success: true,
        message: 'Deposit initialized successfully',
        data: {
          provider: 'paystack',
          authorization_url: 'https://checkout.paystack.com/xxx',
          access_code: 'xxx',
          reference: 'WALLET-PSTK-1234567890-xxx',
          amount: 5000,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid amount or velocity limit exceeded',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async initializeDeposit(
    @GetUser('id') userId: string,
    @Body() dto: InitializeDepositDto,
  ) {
    const result = await this.walletService.initializeDeposit(userId, dto);
    return {
      success: true,
      message: 'Deposit initialized successfully',
      data: result,
    };
  }

  @Post('deposit/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify wallet deposit',
    description:
      'Verify wallet deposit payment (Paystack or Monnify) and credit wallet after successful payment.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deposit verified and wallet credited',
    schema: {
      example: {
        success: true,
        message: 'Deposit verified successfully',
        data: {
          status: 'success',
          message: 'Deposit successful',
          transaction: {
            id: '123e4567-e89b-12d3-a456-426614174000',
            amount: 5000,
            type: 'DEPOSIT',
            status: 'COMPLETED',
            paymentMethod: 'PAYSTACK',
            reference: 'WALLET-PSTK-1234567890-xxx',
            createdAt: '2026-02-17T10:00:00.000Z',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Payment verification failed or amount mismatch',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Transaction already processed' })
  async verifyDeposit(
    @GetUser('id') userId: string,
    @Body() dto: VerifyDepositDto,
  ) {
    const result = await this.walletService.verifyDeposit(
      userId,
      dto.reference,
      dto.provider,
    );
    return {
      success: true,
      message: 'Deposit verified successfully',
      data: result,
    };
  }

  @Post('paystack-webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint() // Hide from Swagger docs (internal endpoint)
  async handleWebhook(@Req() req: Request, @Headers() headers: any) {
    // Verify webhook signature (Paystack sends x-paystack-signature)
    // For production, implement signature verification
    const signature = headers['x-paystack-signature'];

    // Add webhook to queue for async processing
    await this.webhookQueue.add('deposit-webhook', req.body, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    // Return 200 immediately to Paystack
    return { status: 'queued' };
  }

  @Post('monnify-webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleMonnifyWebhook(@Req() req: Request, @Headers() headers: any) {
    const signature = headers['monnify-signature'] as string | undefined;
    const rawBody = JSON.stringify(req.body);

    if (signature && !this.monnifyService.verifyWebhookSignature(rawBody, signature)) {
      return { status: 'invalid_signature' };
    }

    await this.monnifyWebhookQueue.add('deposit-webhook', req.body, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    return { status: 'queued' };
  }
}
