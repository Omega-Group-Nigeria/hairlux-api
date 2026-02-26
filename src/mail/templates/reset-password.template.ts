import { baseTemplate } from './base.template';

export function resetPasswordTemplate(
  firstName: string,
  resetUrl: string,
): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1A1A1A;">Reset your password</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.6;">
      Hi <strong>${firstName}</strong>, we received a request to reset the password for your HairLux account.
      Click the button below to choose a new password.
    </p>

    <!-- CTA button -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr>
        <td style="border-radius:8px;background-color:#C9A872;">
          <a href="${resetUrl}"
             target="_blank"
             style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#1A1A1A;text-decoration:none;letter-spacing:0.3px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            Reset Password
          </a>
        </td>
      </tr>
    </table>

    <!-- Fallback link -->
    <p style="margin:0 0 6px;font-size:13px;color:#888888;">Or paste this link into your browser:</p>
    <p style="margin:0 0 24px;font-size:12px;color:#AAAAAA;word-break:break-all;">${resetUrl}</p>

    <!-- Warning box -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background-color:#FFF8F0;border-left:3px solid #C9A872;border-radius:4px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#777777;line-height:1.5;">
            This link expires in <strong>1 hour</strong>. If you didn't request a password reset,
            you can safely ignore this email — your password won't change.
          </p>
        </td>
      </tr>
    </table>
  `;

  return baseTemplate({
    title: 'Reset your password — HairLux',
    previewText: 'Reset your HairLux password — link expires in 1 hour',
    content,
  });
}
