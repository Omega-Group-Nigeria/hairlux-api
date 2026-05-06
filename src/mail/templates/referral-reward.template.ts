import { baseTemplate } from './base.template';

export interface ReferralRewardData {
  earnedAmount: number;
  referredName: string;
  newBalance: number;
}

export function referralRewardTemplate(
  firstName: string,
  data: ReferralRewardData,
): string {
  const formattedEarned = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(data.earnedAmount);

  const formattedBalance = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(data.newBalance);

  const content = `
    <!-- Icon + heading -->
    <div style="text-align:center;margin-bottom:16px;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" enable-background="new 0 0 64 64" width="70" height="70"><path d="M32,2C15.431,2,2,15.432,2,32c0,16.568,13.432,30,30,30c16.568,0,30-13.432,30-30C62,15.432,48.568,2,32,2z M25.025,50  l-0.02-0.02L24.988,50L11,35.6l7.029-7.164l6.977,7.184l21-21.619L53,21.199L25.025,50z" fill="#43a047"/></svg>
    </div>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1A1A1A;text-align:center;">You've Earned a Referral Reward!</h1>
    <p style="margin:0 0 28px;font-size:15px;color:#555555;line-height:1.6;text-align:center;">
      Hi <strong>${firstName}</strong>, your friend <strong>${data.referredName}</strong> just made their first deposit — and you've been rewarded!
    </p>

    <!-- Reward amount highlight -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center" style="background-color:#F9F6F0;border:1px solid #E8DCC8;border-radius:10px;padding:28px;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#999999;">Reward Credited</p>
          <p style="margin:0;font-size:40px;font-weight:700;color:#1A1A1A;">${formattedEarned}</p>
        </td>
      </tr>
    </table>

    <!-- Details -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;border:1px solid #EEEEEE;border-radius:10px;overflow:hidden;">
      <tr>
        <td style="background-color:#1A1A1A;padding:12px 20px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#C9A872;">Reward Details</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;width:45%;">
                <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#AAAAAA;">Referred Friend</p>
              </td>
              <td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;">
                <p style="margin:0;font-size:13px;font-weight:600;color:#1A1A1A;">${data.referredName}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 20px;">
                <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#AAAAAA;">New Wallet Balance</p>
              </td>
              <td style="padding:14px 20px;">
                <p style="margin:0;font-size:13px;font-weight:600;color:#1A1A1A;">${formattedBalance}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 28px;font-size:14px;color:#555555;line-height:1.6;text-align:center;">
      Keep sharing your referral code and earn more rewards every time a friend deposits for the first time!
    </p>
  `;

  return baseTemplate({
    title: 'Referral Reward — HairLux',
    previewText: `You earned ${formattedEarned} — your friend ${data.referredName} made their first deposit!`,
    content,
  });
}
