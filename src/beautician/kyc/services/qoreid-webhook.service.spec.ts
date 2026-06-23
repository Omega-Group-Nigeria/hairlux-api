import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { QoreidWebhookService } from './qoreid-webhook.service';

describe('QoreidWebhookService', () => {
  let service: QoreidWebhookService;

  const secret = 'test-webhook-secret';
  const mockConfig = {
    get: jest.fn((key: string) =>
      key === 'QOREID_WEBHOOK_SECRET' ? secret : undefined,
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QoreidWebhookService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<QoreidWebhookService>(QoreidWebhookService);
  });

  it('accepts a valid HMAC signature', () => {
    const rawBody = JSON.stringify({ status: 'verified' });
    const signature = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    expect(() => service.verifySignature(rawBody, signature)).not.toThrow();
  });

  it('rejects an invalid signature', () => {
    expect(() =>
      service.verifySignature('{"status":"verified"}', 'bad-signature'),
    ).toThrow(UnauthorizedException);
  });
});