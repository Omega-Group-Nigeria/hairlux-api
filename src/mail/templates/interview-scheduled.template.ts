import { baseTemplate } from './base.template';

export interface InterviewScheduledData {
  applicationCode: string;
  scheduledAt: Date;
  mode: 'IN_PERSON' | 'VIRTUAL';
  locationName?: string;
  meetingUrl?: string;
  interviewerName: string;
  note?: string;
  dashboardUrl: string;
}

export function interviewScheduledTemplate(firstName: string, data: InterviewScheduledData): string {
  const dateStr = data.scheduledAt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
  const timeStr = data.scheduledAt.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' });

  const whereLine = data.mode === 'VIRTUAL'
    ? `<p><strong>Meeting Link:</strong> <a href="${data.meetingUrl}">${data.meetingUrl}</a></p>`
    : `<p><strong>Location:</strong> ${data.locationName || 'To be confirmed'}</p>`;

  const body = `
    <p>Hi ${firstName},</p>
    <p>Your interview has been scheduled. Here are the details:</p>
    <p><strong>Date:</strong> ${dateStr}<br><strong>Time:</strong> ${timeStr}</p>
    ${whereLine}
    <p><strong>Interviewer:</strong> ${data.interviewerName}</p>
    ${data.note ? `<p><strong>Note:</strong> ${data.note}</p>` : ''}
    <p><strong>Application Reference:</strong> ${data.applicationCode}</p>
    <p><a href="${data.dashboardUrl}">View in your applicant dashboard →</a></p>
  `;
  return baseTemplate({ title: 'Interview Scheduled — HairLux', previewText: 'Your interview has been scheduled', content: body });
}