import { baseTemplate } from './base.template';

export interface ApplicationConfirmationData {
  applicationCode: string;
  otp: string;
  dashboardUrl: string;
}

export function applicationConfirmationTemplate(
  firstName: string,
  data: ApplicationConfirmationData,
): string {
  const title = 'Application Received — HairLux';

  const body = `
    <p>Hi ${firstName},</p>
    <p>Thanks for applying to HairLux! Your application has been received and is now under review.</p>
    <p><strong>Application Reference:</strong> ${data.applicationCode}</p>
    <p>You can track your application status anytime by logging in to your applicant dashboard:</p>
    <p><a href="${data.dashboardUrl}">${data.dashboardUrl}</a></p>
    <p>Use the one-time password below to log in:</p>
    <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px;">${data.otp}</p>
    <p>This code expires in 24 hours.</p>
  `;

  return baseTemplate({
    title,
    previewText: `Your application ${data.applicationCode} has been received`,
    content: body,
  });
} 