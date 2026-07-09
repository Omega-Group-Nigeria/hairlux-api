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

  it('accepts a valid HMAC-SHA512 signature', () => {
    const rawBody = JSON.stringify({ status: 'verified' });
    const signature = createHmac('sha512', secret)
      .update(rawBody)
      .digest('hex');

    expect(() => service.verifySignature(rawBody, signature)).not.toThrow();
  });

  it('rejects an invalid signature', () => {
    expect(() =>
      service.verifySignature('{"status":"verified"}', 'bad-signature'),
    ).toThrow(UnauthorizedException);
  });

  describe('isRegistrationProbe', () => {
    it('returns true when signature and body are both missing', () => {
      expect(
        service.isRegistrationProbe({
          body: {},
          rawBody: '',
          signatureHeader: undefined,
        }),
      ).toBe(true);
    });

    it('returns true when rawBody is undefined (empty POST)', () => {
      expect(
        service.isRegistrationProbe({
          body: undefined,
          rawBody: undefined,
          signatureHeader: undefined,
        }),
      ).toBe(true);
    });

    it('returns true when only the signature is missing', () => {
      expect(
        service.isRegistrationProbe({
          body: { event: 'ping' },
          rawBody: '{"event":"ping"}',
          signatureHeader: undefined,
        }),
      ).toBe(true);
    });

    it('returns true when only the body is empty', () => {
      expect(
        service.isRegistrationProbe({
          body: {},
          rawBody: '{}',
          signatureHeader: 'abc123',
        }),
      ).toBe(true);
    });

    it('returns false for a signed webhook with payload', () => {
      expect(
        service.isRegistrationProbe({
          body: { status: 'verified', sessionId: 'sess-1' },
          rawBody: JSON.stringify({
            status: 'verified',
            sessionId: 'sess-1',
          }),
          signatureHeader: 'abc123',
        }),
      ).toBe(false);
    });
  });
});