import { baseTemplate } from './base.template';

export interface DepositSuccessData {
  amount: number;
  reference: string;
  newBalance: number;
  date: string;
}

export function depositSuccessTemplate(
  firstName: string,
  deposit: DepositSuccessData,
): string {
  const formattedAmount = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(deposit.amount);

  const formattedBalance = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(deposit.newBalance);

  const content = `
    <!-- Icon + heading -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon icon-tabler icons-tabler-filled icon-tabler-rosette-discount-check" width="80" height="80" fill="#61a178"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path><path d="M12.01 2.011a3.2 3.2 0 0 1 2.113 .797l.154 .145l.698 .698a1.2 1.2 0 0 0 .71 .341l.135 .008h1a3.2 3.2 0 0 1 3.195 3.018l.005 .182v1c0 .27 .092 .533 .258 .743l.09 .1l.697 .698a3.2 3.2 0 0 1 .147 4.382l-.145 .154l-.698 .698a1.2 1.2 0 0 0 -.341 .71l-.008 .135v1a3.2 3.2 0 0 1 -3.018 3.195l-.182 .005h-1a1.2 1.2 0 0 0 -.743 .258l-.1 .09l-.698 .697a3.2 3.2 0 0 1 -4.382 .147l-.154 -.145l-.698 -.698a1.2 1.2 0 0 0 -.71 -.341l-.135 -.008h-1a3.2 3.2 0 0 1 -3.195 -3.018l-.005 -.182v-1a1.2 1.2 0 0 0 -.258 -.743l-.09 -.1l-.697 -.698a3.2 3.2 0 0 1 -.147 -4.382l.145 -.154l.698 -.698a1.2 1.2 0 0 0 .341 -.71l.008 -.135v-1l.005 -.182a3.2 3.2 0 0 1 3.013 -3.013l.182 -.005h1a1.2 1.2 0 0 0 .743 -.258l.1 -.09l.698 -.697a3.2 3.2 0 0 1 2.269 -.944zm3.697 7.282a1 1 0 0 0 -1.414 0l-3.293 3.292l-1.293 -1.292l-.094 -.083a1 1 0 0 0 -1.32 1.497l2 2l.094 .083a1 1 0 0 0 1.32 -.083l4 -4l.083 -.094a1 1 0 0 0 -.083 -1.32z"></path></svg>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1A1A1A;text-align:center;">Deposit Successful</h1>
    <p style="margin:0 0 28px;font-size:15px;color:#555555;line-height:1.6;text-align:center;">
      Hi <strong>${firstName}</strong>, your wallet has been credited successfully.
    </p>

    <!-- Amount highlight -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center" style="background-color:#F9F6F0;border:1px solid #E8DCC8;border-radius:10px;padding:28px;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#999999;">Amount Credited</p>
          <p style="margin:0;font-size:40px;font-weight:700;color:#1A1A1A;">${formattedAmount}</p>
        </td>
      </tr>
    </table>

    <!-- Transaction details -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;border:1px solid #EEEEEE;border-radius:10px;overflow:hidden;">
      <tr>
        <td style="background-color:#1A1A1A;padding:12px 20px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#C9A872;">Transaction Details</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

            <tr>
              <td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;width:40%;">
                <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#AAAAAA;">Reference</p>
              </td>
              <td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;">
                <p style="margin:0;font-size:13px;font-weight:600;color:#1A1A1A;font-family:'Courier New',monospace;">${deposit.reference}</p>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;">
                <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#AAAAAA;">Date</p>
              </td>
              <td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;">
                <p style="margin:0;font-size:14px;font-weight:600;color:#1A1A1A;">${deposit.date}</p>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 20px;">
                <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#AAAAAA;">New Balance</p>
              </td>
              <td style="padding:14px 20px;">
                <p style="margin:0;font-size:14px;font-weight:700;color:#C9A872;">${formattedBalance}</p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#AAAAAA;line-height:1.6;text-align:center;">
      If you did not authorise this transaction, please contact our support team immediately.
    </p>
  `;

  return baseTemplate({
    title: 'Deposit Successful — HairLux',
    previewText: `${formattedAmount} has been credited to your HairLux wallet`,
    content,
  });
}
