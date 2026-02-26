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
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="#C9A872">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M12 1a1 1 0 0 1 .993 .883l.007 .117v1.354l1.172 -.676a1 1 0 0 1 1.284 .23l.07 .1a1 1 0 0 1 -.23 1.284l-.1 .07l-1.196 .69l1.196 .69a1 1 0 0 1 .364 1.284l-.064 .1a1 1 0 0 1 -1.284 .364l-.1 -.064l-1.172 -.677v1.354a1 1 0 0 1 -1.993 .117l-.007 -.117v-1.354l-1.172 .677a1 1 0 0 1 -1.348 -1.348l.064 -.1l1.196 -.69l-1.196 -.69a1 1 0 0 1 -.364 -1.284l.064 -.1a1 1 0 0 1 1.284 -.364l.1 .064l1.172 .676v-1.354a1 1 0 0 1 1 -1z"/>
      <path d="M6 12a1 1 0 0 1 1 1v6a1 1 0 0 1 -2 0v-6a1 1 0 0 1 1 -1z"/>
      <path d="M18 12a1 1 0 0 1 1 1v6a1 1 0 0 1 -2 0v-6a1 1 0 0 1 1 -1z"/>
      <path d="M12 12a1 1 0 0 1 1 1v6a1 1 0 0 1 -2 0v-6a1 1 0 0 1 1 -1z"/>
    </svg>
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
