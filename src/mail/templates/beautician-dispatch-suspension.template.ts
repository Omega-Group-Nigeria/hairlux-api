import { baseTemplate } from './base.template';

export type DispatchSuspensionEmailKind = 'SUSPENDED' | 'REINSTATED';

export type DispatchSuspensionEmailData = {
  firstName: string;
  kind: DispatchSuspensionEmailKind;
  reason?: string | null;
  suspendedUntil?: Date | string | null;
  /** true when lift was automatic at end of probation */
  automatic?: boolean;
};

function formatWhen(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toUTCString();
}

export function beauticianDispatchSuspensionTemplate(
  data: DispatchSuspensionEmailData,
): string {
  const untilLabel = formatWhen(data.suspendedUntil ?? null);

  if (data.kind === 'SUSPENDED') {
    const timedBlock = untilLabel
      ? `<p>This is a <strong>timed probation</strong>. Dispatch access will be restored automatically on <strong>${untilLabel}</strong> (UTC), unless our team extends or lifts it earlier.</p>`
      : `<p>This suspension is <strong>indefinite</strong> until our operations team re-enables your dispatch access.</p>`;

    const reasonBlock = data.reason
      ? `<p><strong>Reason:</strong> ${escapeHtml(data.reason)}</p>`
      : '';

    return baseTemplate({
      title: 'Dispatch Access Suspended — HairLux',
      previewText: 'Your home-service job offers are temporarily paused',
      content: `
        <p>Hi ${escapeHtml(data.firstName)},</p>
        <p>Your account has been <strong>suspended from dispatch matching</strong>. You will not receive new home-service job offers while this is in effect.</p>
        ${reasonBlock}
        ${timedBlock}
        <p><strong>What you can still do:</strong></p>
        <ul>
          <li>Sign in to the beautician app and review your profile</li>
          <li>Complete any job already assigned to you</li>
          <li>Contact support if you believe this was applied in error</li>
        </ul>
        <p>You cannot go online for new offers until dispatch access is restored.</p>
        <p>— HairLux Operations</p>
      `,
    });
  }

  const autoNote = data.automatic
    ? '<p>Your timed probation period has ended, so dispatch access was restored automatically.</p>'
    : '<p>Our operations team has re-enabled your dispatch access.</p>';

  return baseTemplate({
    title: 'Dispatch Access Restored — HairLux',
    previewText: 'You can receive home-service job offers again',
    content: `
      <p>Hi ${escapeHtml(data.firstName)},</p>
      <p>Good news — your account is <strong>eligible for dispatch matching again</strong>.</p>
      ${autoNote}
      <p><strong>Next steps:</strong></p>
      <ul>
        <li>Open the beautician app</li>
        <li>Go <strong>ONLINE</strong> when you are ready to accept jobs</li>
        <li>Ensure your location is enabled so we can match nearby bookings</li>
      </ul>
      <p>Thank you for being part of HairLux.</p>
      <p>— HairLux Operations</p>
    `,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
