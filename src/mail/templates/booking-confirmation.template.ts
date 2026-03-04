import { baseTemplate } from './base.template';

export interface BookingConfirmationData {
  services: { name: string; price: number; duration: number }[];
  date: string;
  time: string;
  address: string;
  totalAmount: number;
  paymentMethod: 'WALLET' | 'CASH';
  bookingIds: string[];
  reservationCode: string;
}

export function bookingConfirmationTemplate(
  firstName: string,
  booking: BookingConfirmationData,
): string {
  const serviceRows = booking.services
    .map(
      (s) => `
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid #F2F2F2;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#1A1A1A;">${s.name}</p>
          <p style="margin:2px 0 0;font-size:12px;color:#AAAAAA;">${s.duration} min</p>
        </td>
        <td style="padding:12px 20px;border-bottom:1px solid #F2F2F2;text-align:right;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#1A1A1A;">&#8358;${s.price.toLocaleString()}</p>
        </td>
      </tr>`,
    )
    .join('');

  const paymentBadgeColor =
    booking.paymentMethod === 'WALLET' ? '#C9A872' : '#888888';
  const paymentLabel =
    booking.paymentMethod === 'WALLET' ? 'Paid via Wallet' : 'Cash on Delivery';
  const statusLabel =
    booking.paymentMethod === 'WALLET' ? 'CONFIRMED' : 'PENDING';
  const statusColor =
    booking.paymentMethod === 'WALLET' ? '#1a7f4b' : '#b45309';
  const statusBg = booking.paymentMethod === 'WALLET' ? '#d1fae5' : '#fef3c7';

  const content = `
    <p style="margin:0 0 4px;font-size:36px;text-align:center;">✨</p>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1A1A1A;text-align:center;">You're all booked!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.6;text-align:center;">
      Hi <strong>${firstName}</strong>, your appointment has been confirmed. We can't wait to see you!
    </p>

    <!-- Status badge -->
    <p style="margin:0 0 24px;text-align:center;">
      <span style="display:inline-block;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;background-color:${statusBg};color:${statusColor};">${statusLabel}</span>
    </p>

    <!-- Reservation Code Block -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background-color:#1A1A1A;border-radius:12px;padding:20px 24px;text-align:center;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#C9A872;">Reservation Code</p>
          <p style="margin:0 0 8px;font-size:32px;font-weight:700;letter-spacing:6px;color:#FFFFFF;font-family:monospace,monospace;">${booking.reservationCode}</p>
          <p style="margin:0;font-size:12px;color:#888888;">Present this code at the salon or to your stylist</p>
        </td>
      </tr>
    </table>

    <!-- Booking details card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #EEEEEE;border-radius:10px;overflow:hidden;">
      <tr>
        <td colspan="2" style="background-color:#1A1A1A;padding:12px 20px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#C9A872;">Appointment Details</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;width:36%;">
          <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#AAAAAA;">Date</p>
        </td>
        <td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#1A1A1A;">${booking.date}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;">
          <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#AAAAAA;">Time</p>
        </td>
        <td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#1A1A1A;">${booking.time}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 20px;">
          <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#AAAAAA;">Location</p>
        </td>
        <td style="padding:14px 20px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#1A1A1A;">${booking.address}</p>
        </td>
      </tr>
    </table>

    <!-- Services breakdown -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #EEEEEE;border-radius:10px;overflow:hidden;">
      <tr>
        <td colspan="2" style="background-color:#1A1A1A;padding:12px 20px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#C9A872;">Services</p>
        </td>
      </tr>
      ${serviceRows}
      <tr>
        <td style="padding:14px 20px;background-color:#FAFAFA;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#1A1A1A;">Total</p>
        </td>
        <td style="padding:14px 20px;background-color:#FAFAFA;text-align:right;">
          <p style="margin:0;font-size:15px;font-weight:700;color:#C9A872;">&#8358;${booking.totalAmount.toLocaleString()}</p>
        </td>
      </tr>
    </table>

    <!-- Payment method -->
    <p style="margin:0 0 24px;text-align:center;font-size:13px;color:#777777;">
      <span style="display:inline-block;background:${paymentBadgeColor}22;color:${paymentBadgeColor};padding:4px 12px;border-radius:20px;font-weight:600;font-size:12px;">💳 ${paymentLabel}</span>
    </p>

    <p style="margin:0;font-size:13px;color:#999999;line-height:1.6;text-align:center;">
      Need to make changes? Contact us before your appointment.
    </p>
  `;

  const firstServiceName = booking.services[0]?.name ?? 'your service';

  return baseTemplate({
    title: 'Booking Confirmed — HairLux',
    previewText: `Your ${firstServiceName} appointment on ${booking.date} at ${booking.time} is confirmed`,
    content,
  });
}
