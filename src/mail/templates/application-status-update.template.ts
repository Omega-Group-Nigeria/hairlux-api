import { baseTemplate } from './base.template';

export interface ApplicationStatusUpdateData {
  applicationCode: string;
  dashboardUrl: string;
  reason?: string;
}

type NotifiableStatus = 'SHORTLISTED' | 'OFFER_EXTENDED' | 'NOT_SELECTED';

const STATUS_COPY: Record<NotifiableStatus, { title: string; body: (data: ApplicationStatusUpdateData) => string }> = {
  SHORTLISTED: {
    title: "You've Been Shortlisted — HairLux",
    body: () => `<p>Great news! Your application has been shortlisted for the next stage of our recruitment process. We'll be in touch soon with interview details.</p>`,
  },
  OFFER_EXTENDED: {
    title: 'Job Offer — HairLux',
    body: () => `<p>Congratulations! We would like to extend an offer of employment to you. Please log in to your applicant dashboard to view the details.</p>`,
  },
  NOT_SELECTED: {
    title: 'Update on Your Application — HairLux',
    body: (data) => `<p>Thank you for applying to HairLux and for the time you invested in the process. After careful review, we won't be moving forward with your application at this time.</p>` +
      (data.reason ? `<p><strong>Note:</strong> ${data.reason}</p>` : ''),
  },
};

export function applicationStatusUpdateTemplate(
  firstName: string,
  status: NotifiableStatus,
  data: ApplicationStatusUpdateData,
): string {
  const copy = STATUS_COPY[status];
  const body = `
    <p>Hi ${firstName},</p>
    ${copy.body(data)}
    <p><strong>Application Reference:</strong> ${data.applicationCode}</p>
    <p><a href="${data.dashboardUrl}">View your application →</a></p>
  `;
  return baseTemplate({ title: copy.title, previewText: copy.title, content: body });
}