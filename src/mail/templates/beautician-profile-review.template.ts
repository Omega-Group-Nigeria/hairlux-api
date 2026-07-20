import { baseTemplate } from './base.template';

export function beauticianProfileReviewTemplate(
  firstName: string,
  outcome: 'APPROVED' | 'REJECTED' | 'SUBMITTED' | 'VIDEO_ONLY',
  notes?: string,
): string {
  const title =
    outcome === 'APPROVED'
      ? 'Profile Approved — HairLux'
      : outcome === 'REJECTED'
        ? 'Profile Not Approved — HairLux'
        : outcome === 'VIDEO_ONLY'
          ? 'Intro Video Re-upload Required — HairLux'
          : 'Profile Submitted — HairLux';

  const body =
    outcome === 'APPROVED'
      ? `<p>Hi ${firstName},</p>
         <p>Congratulations! Your professional profile has been <strong>approved</strong> after our evaluation.</p>
         ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
         <p>You can now go online and start accepting home service jobs in the beautician app.</p>`
      : outcome === 'REJECTED'
        ? `<p>Hi ${firstName},</p>
           <p>Your professional profile was <strong>not approved</strong> at this time.</p>
           ${notes ? `<p><strong>Feedback:</strong> ${notes}</p>` : ''}
           <p>Please update your profile and resubmit for another review.</p>`
        : outcome === 'VIDEO_ONLY'
          ? `<p>Hi ${firstName},</p>
           <p>Your professional profile details look good, but your <strong>intro video was not accepted</strong>.</p>
           ${notes ? `<p><strong>Feedback:</strong> ${notes}</p>` : ''}
           <p>Please open the beautician app, record a new 1-minute intro video, and submit it again. You do not need to re-edit your profile.</p>`
          : `<p>Hi ${firstName},</p>
           <p>Your professional profile has been <strong>submitted for review</strong>. Our team will schedule your evaluation and notify you of the outcome.</p>`;

  return baseTemplate({
    title,
    previewText: title,
    content: body,
  });
}