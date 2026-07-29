import { baseTemplate } from './base.template';

export interface OfferDeclinedData {
    candidateName: string;
    applicationCode: string;
    declineReason?: string;
    postingNowEmpty: boolean;
}

export function offerDeclinedTemplate(
    firstName: string,
    data: OfferDeclinedData,
): string {
    const title = 'Offer Declined — HairLux';

    const body = `
    <p>Hi ${firstName},</p>
    <p><strong>${data.candidateName}</strong> (application ${data.applicationCode}) has declined their offer.</p>
    ${data.declineReason ? `<p><strong>Reason given:</strong> ${data.declineReason}</p>` : ''}
    ${data.postingNowEmpty
            ? '<p>This posting now has no remaining active candidates — you may want to reopen it or push out a new listing.</p>'
            : ''
        }
  `;

    return baseTemplate({
        title,
        previewText: `${data.candidateName} declined their offer`,
        content: body,
    });
}