import { baseTemplate } from './base.template';

export function beauticianKycResultTemplate(
  firstName: string,
  outcome: 'VERIFIED' | 'REJECTED' | 'NEEDS_REVIEW',
  reason?: string,
): string {
  const title =
    outcome === 'VERIFIED'
      ? 'KYC Verified — HairLux'
      : outcome === 'REJECTED'
        ? 'KYC Not Approved — HairLux'
        : 'KYC Under Review — HairLux';
 
  const body =
    outcome === 'VERIFIED'
      ? `<p>Hi ${firstName},</p>
         <p>Your identity verification (KYC) has been <strong>approved</strong>. You can now complete your professional profile and submit it for review in the beautician app.</p>`
      : outcome === 'REJECTED'
        ? `<p>Hi ${firstName},</p>
           <p>Your identity verification (KYC) was <strong>not approved</strong>.</p>
           ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
           <p>Please contact support or restart verification if eligible.</p>`
        : `<p>Hi ${firstName},</p>
           <p>Your identity verification requires <strong>manual review</strong> by our team. We will notify you once a decision is made.</p>`;

  return baseTemplate({
    title,
    previewText: title,
    content: body,
  });
}