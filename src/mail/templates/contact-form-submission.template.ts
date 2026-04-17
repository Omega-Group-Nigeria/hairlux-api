import { baseTemplate } from './base.template';

export interface ContactFormSubmissionData {
  name: string;
  emailAddress: string;
  phoneNo: string;
  subject: string;
  message: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMessage(message: string): string {
  return escapeHtml(message).replace(/\r?\n/g, '<br/>');
}

export function contactFormSubmissionTemplate(
  data: ContactFormSubmissionData,
): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1A1A1A;text-align:center;">New Contact Form Submission</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#555555;line-height:1.6;text-align:center;">
      A new message was submitted from your website contact form.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #EEEEEE;border-radius:10px;overflow:hidden;">
      <tr>
        <td style="background-color:#1A1A1A;padding:12px 20px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#C9A872;">Submission Details</p>
        </td>
      </tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;"><strong>Name:</strong> ${escapeHtml(data.name)}</td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;"><strong>Email:</strong> ${escapeHtml(data.emailAddress)}</td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;"><strong>Phone:</strong> ${escapeHtml(data.phoneNo)}</td></tr>
      <tr><td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;"><strong>Subject:</strong> ${escapeHtml(data.subject)}</td></tr>
      <tr>
        <td style="padding:14px 20px;">
          <strong>Message:</strong><br/>
          <div style="margin-top:8px;white-space:normal;line-height:1.6;color:#333333;">
            ${formatMessage(data.message)}
          </div>
        </td>
      </tr>
    </table>
  `;

  return baseTemplate({
    title: 'New Contact Form Submission — HairLux',
    previewText: `Contact form submission from ${data.name}`,
    content,
  });
}
