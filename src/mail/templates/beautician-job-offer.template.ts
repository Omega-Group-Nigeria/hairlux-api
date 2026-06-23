import { baseTemplate } from './base.template';

export function beauticianJobOfferTemplate(
  firstName: string,
  bookingId: string,
  estEarnings: number,
): string {
  return baseTemplate({
    title: 'New Home Service Job — HairLux',
    previewText: 'A new home service job is available near you.',
    content: `<p>Hi ${firstName},</p>
      <p>A new <strong>home service job</strong> is available near you.</p>
      <p><strong>Estimated earnings:</strong> ₦${estEarnings.toLocaleString('en-NG')}</p>
      <p>Open the beautician app to view details and accept the job before the offer expires.</p>
      <p style="font-size:13px;color:#666;">Booking reference: ${bookingId}</p>`,
  });
}