import { baseTemplate } from './base.template';

export function serviceCompletedTemplate(
  firstName: string,
  bookingId: string,
  rating: number,
): string {
  return baseTemplate({
    title: 'Service Completed — HairLux',
    previewText: 'The customer confirmed service completion.',
    content: `<p>Hi ${firstName},</p>
      <p>The customer confirmed completion of your home service job.</p>
      <p><strong>Customer rating:</strong> ${rating}/5</p>
      <p style="font-size:13px;color:#666;">Booking reference: ${bookingId}</p>`,
  });
}