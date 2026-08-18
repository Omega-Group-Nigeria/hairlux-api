import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const QOREID_BASE = 'https://api.qoreid.com';

export interface NinBio {
  dob: string;
  gender: string;
  phone: string;
  address: string;
  /** Raw base64 JPEG from QoreID (response.nin.photo) — no data: prefix. Undefined if QoreID didn't return one. */
  photoBase64?: string;
}

export type VerifyNinResult =
  | { verified: true; bio: NinBio }
  | { verified: false; reason: 'NAME_MISMATCH' };

export interface SubmitAddressVerificationParams {
  customerReference: string;
  street: string;
  city: string;
  lgaName: string;
  stateName: string;
  landmark?: string;
  applicant: {
    firstname: string;
    lastname: string;
    phone: string;
    dob?: string; // YYYY-MM-DD
    gender?: string;
    idType?: 'nin' | 'bvn' | 'drivers_license';
    idNumber?: string;
  };
  addressExtraData: {
    houseNumber?: string;
    generalDescription: string;
    latitude: number;
    longitude: number;
    buildingDescription: 'Residential' | 'Commercial';
    hasGateAndFence: boolean;
    buildingStatus: 'Completed' | 'Painted' | 'Completed and Painted';
    buildingType: 'Multi-story' | 'Flats & Apartment' | 'Bungalow' | 'Office Complex';
    buildingColour: string;
    // base64, no data: prefix -- caller (StaffAddressVerificationService) is
    // responsible for stripping any data: URI prefix before this point.
    applicantPhoto1?: string;
    applicantPhoto2?: string;
    applicantPhoto3?: string;
  };
}

export interface SubmitAddressVerificationResult {
  qoreidVerificationId: string;
  status: string;
  subStatus: string;
  state: string;
}

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

    const clientId = this.config.get<string>('QOREID_CLIENT_ID_NIN');
    const secret = this.config.get<string>('QOREID_SECRET_NIN');

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
      photoBase64: nin.photo || undefined,
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

  /**
   * Physical Address Verification Pro -- genuinely asynchronous, unlike
   * NIN verification above. This call only ever returns an IN_PROGRESS
   * acknowledgement; QoreID's ~30,000 field agents physically visit the
   * address over the next 24-48h, and the real result arrives later via
   * webhook (see StaffAddressVerificationService.handleWebhook).
   */
  async submitAddressVerification(params: SubmitAddressVerificationParams): Promise<SubmitAddressVerificationResult> {
    const token = await this.getAccessToken();

    const res = await fetch(`${QOREID_BASE}/v1/addresses/pro`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerReference: params.customerReference,
        street: params.street,
        city: params.city,
        lgaName: params.lgaName,
        stateName: params.stateName,
        landmark: params.landmark,
        applicant: params.applicant,
        addressExtraData: params.addressExtraData,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data) {
      this.logger.error(`QoreID address verification submission failed (${res.status})`);
      throw new QoreidRequestError(res.status, data);
    }

    return {
      qoreidVerificationId: String(data.id),
      status: data.address?.status?.status ?? data.summary?.address_check ?? 'IN_PROGRESS',
      subStatus: data.address?.status?.subStatus ?? '',
      state: data.address?.status?.state ?? 'IN_PROGRESS',
    };
  }
}