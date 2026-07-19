import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const QOREID_BASE = 'https://api.qoreid.com';

export interface NinBio {
  dob: string;
  gender: string;
  phone: string;
  address: string;
}

export type VerifyNinResult =
  | { verified: true; bio: NinBio }
  | { verified: false; reason: 'NAME_MISMATCH' };

export class QoreidRequestError extends Error {
  constructor(public readonly status: number, public readonly detail?: unknown) {
    super(`QoreID request failed (${status})`);
  }
}

@Injectable()
export class QoreidService {
  private readonly logger = new Logger(QoreidService.name);
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0; // epoch ms

  constructor(private readonly config: ConfigService) {}

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt - 60_000) {
      return this.cachedToken;
    }

    const clientId = this.config.get<string>('QOREID_CLIENT_ID');
    const secret = this.config.get<string>('QOREID_SECRET');

    if (!clientId || !secret) {
      throw new Error('QOREID_CLIENT_ID / QOREID_SECRET are not set in the environment');
    }

    const res = await fetch(`${QOREID_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, secret }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new QoreidRequestError(res.status, text);
    }

    const data = await res.json();
    const token: string = data.accessToken;
    this.cachedToken = token;
    this.tokenExpiresAt = now + (data.expiresIn || 7200) * 1000;
    return token;
}

  async verifyNin(nin: string, firstName: string, lastName: string): Promise<VerifyNinResult> {
    const token = await this.getAccessToken();

    const res = await fetch(`${QOREID_BASE}/v1/ng/identities/nin/${encodeURIComponent(nin)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ firstname: firstName, lastname: lastName }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data) {
      this.logger.error(`QoreID NIN verification failed (${res.status})`);
      throw new QoreidRequestError(res.status, data);
    }

    const ninCheck = data.summary?.nin_check;
    const fieldMatches = ninCheck?.fieldMatches ?? {};
    const isVerified =
      data.status?.status === 'verified' &&
      ninCheck?.status === 'EXACT_MATCH' &&
      fieldMatches.firstname === true &&
      fieldMatches.lastname === true;

    if (!isVerified) {
      return { verified: false, reason: 'NAME_MISMATCH' };
    }

    return { verified: true, bio: this.normalizeBio(data.nin) };
  }

  private normalizeBio(nin: any): NinBio {
    return {
      dob: this.formatNimcDate(nin.birthdate),
      gender: nin.gender === 'm' ? 'Male' : nin.gender === 'f' ? 'Female' : '',
      phone: nin.phone || '',
      address: this.formatAddress(nin.residence),
    };
  }

  // NIMC dates come back as DD-MM-YYYY
  private formatNimcDate(raw: string): string {
    if (!raw) return '';
    const [day, month, year] = raw.split('-');
    if (!day || !month || !year) return raw;
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthName = months[parseInt(month, 10) - 1] || month;
    return `${parseInt(day, 10)} ${monthName} ${year}`;
  }

  private formatAddress(residence: any): string {
    if (!residence) return '';
    return [residence.address1, residence.town, residence.lga, residence.state]
      .filter(Boolean)
      .join(', ');
  }
}