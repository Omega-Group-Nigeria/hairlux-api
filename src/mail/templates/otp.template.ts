import { baseTemplate } from './base.template';

export function otpTemplate(firstName: string, otpCode: string): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1A1A1A;">Verify your email address</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.6;">
      Welcome to HairLux, <strong>${firstName}</strong>! Use the code below to verify your email address.
      This code expires in <strong>10 minutes</strong>.
    </p>

    <!-- OTP box -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center" style="background-color:#F9F6F0;border:1px solid #E8DCC8;border-radius:10px;padding:28px;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#999999;">Your verification code</p>
          <p style="margin:0;font-size:44px;font-weight:700;letter-spacing:10px;color:#1A1A1A;font-family:'Courier New',monospace;">${otpCode}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 8px;font-size:14px;color:#777777;line-height:1.6;">
      If you didn't create a HairLux account, no action is needed — just ignore this email.
    </p>
  `;

  return baseTemplate({
    title: 'Verify your email — HairLux',
    previewText: `Your HairLux verification code is ${otpCode}`,
    content,
  });
}
