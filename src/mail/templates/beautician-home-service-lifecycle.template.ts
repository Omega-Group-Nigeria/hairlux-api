import { baseTemplate } from './base.template';

export function arrivalVerificationNeededTemplate(
  firstName: string,
  bookingId: string,
): string {
  return baseTemplate({
    title: 'Verify Your Beautician — HairLux',
    previewText: 'Your beautician has arrived. Verify to start your service.',
    content: `<p>Hi ${firstName},</p>
      <p>Your beautician has arrived for your home service booking.</p>
      <p>Open the HairLux app and enter the verification PIN or scan the QR code to confirm arrival and start your service.</p>
      <p style="font-size:13px;color:#666;">Booking reference: ${bookingId}</p>`,
  });
}

export function arrivalVerifiedTemplate(
  firstName: string,
  bookingId: string,
): string {
  return baseTemplate({
    title: 'Arrival Verified — HairLux',
    previewText: 'The customer verified your arrival.',
    content: `<p>Hi ${firstName},</p>
      <p>The customer verified your arrival. Your service timer has started.</p>
      <p style="font-size:13px;color:#666;">Booking reference: ${bookingId}</p>`,
  });
}

export function serviceAwaitingConfirmationTemplate(
  firstName: string,
  bookingId: string,
): string {
  return baseTemplate({
    title: 'Confirm Your Service — HairLux',
    previewText: 'Your beautician marked the service complete.',
    content: `<p>Hi ${firstName},</p>
      <p>Your beautician has marked your home service as complete.</p>
      <p>Please confirm completion and leave a rating in the HairLux app.</p>
      <p style="font-size:13px;color:#666;">Booking reference: ${bookingId}</p>`,
  });
}

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