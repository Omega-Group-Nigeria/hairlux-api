import { baseTemplate } from './base.template';

export interface GuestBookingNotificationData {
  services: { name: string; price: number; duration: number }[];
  date: string;
  time: string;
  address: string;
  totalAmount: number;
  reservationCode: string;
  bookedByName: string; // The person who made the booking
}

export function guestBookingNotificationTemplate(
  guestName: string,
  data: GuestBookingNotificationData,
): string {
  const serviceRows = data.services
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

  const content = `
    <p style="margin:0 0 4px;font-size:36px;text-align:center;">🎉</p>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1A1A1A;text-align:center;">A booking was made for you!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.6;text-align:center;">
      Hi <strong>${guestName}</strong>, <strong>${data.bookedByName}</strong> has booked a HairLux appointment on your behalf.
      All you need to do is show up — your reservation code is below.
    </p>

    <!-- Reservation Code Block -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background-color:#1A1A1A;border-radius:12px;padding:20px 24px;text-align:center;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#C9A872;">Your Reservation Code</p>
          <p style="margin:0 0 8px;font-size:32px;font-weight:700;letter-spacing:6px;color:#FFFFFF;font-family:monospace,monospace;">${data.reservationCode}</p>
          <p style="margin:0;font-size:12px;color:#888888;">Present this code at the salon or to your stylist to redeem your appointment</p>
        </td>
      </tr>
    </table>

    <!-- Booked by notice -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="background-color:#FFF8F0;border-left:4px solid #C9A872;border-radius:0 8px 8px 0;padding:14px 18px;">
          <p style="margin:0;font-size:13px;color:#7A5C2E;line-height:1.6;">
            🤝 <strong>${data.bookedByName}</strong> booked and paid for this appointment for you. Lucky you!
          </p>
        </td>
      </tr>
    </table>

    <!-- Appointment Details -->
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
          <p style="margin:0;font-size:14px;font-weight:600;color:#1A1A1A;">${data.date}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;">
          <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#AAAAAA;">Time</p>
        </td>
        <td style="padding:14px 20px;border-bottom:1px solid #F2F2F2;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#1A1A1A;">${data.time}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 20px;">
          <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#AAAAAA;">Location</p>
        </td>
        <td style="padding:14px 20px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#1A1A1A;">${data.address}</p>
        </td>
      </tr>
    </table>

    <!-- Services breakdown -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #EEEEEE;border-radius:10px;overflow:hidden;">
      <tr>
        <td colspan="2" style="background-color:#1A1A1A;padding:12px 20px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#C9A872;">Services Booked For You</p>
        </td>
      </tr>
      ${serviceRows}
      <tr>
        <td style="padding:14px 20px;background-color:#FAFAFA;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#1A1A1A;">Total</p>
        </td>
        <td style="padding:14px 20px;background-color:#FAFAFA;text-align:right;">
          <p style="margin:0;font-size:15px;font-weight:700;color:#C9A872;">&#8358;${data.totalAmount.toLocaleString()}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 8px;font-size:13px;color:#888888;text-align:center;line-height:1.6;">
      Simply show up at the scheduled time and present your reservation code.<br>
      We look forward to seeing you at HairLux! 💇‍♀️
    </p>
  `;

  return baseTemplate({
    title: `A booking was made for you [${data.reservationCode}] — HairLux`,
    previewText: `${data.bookedByName} booked a HairLux appointment for you on ${data.date} at ${data.time}`,
    content,
  });
}
