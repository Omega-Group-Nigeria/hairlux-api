import { baseTemplate } from './base.template';

export interface OfferExtendedData {
    applicationCode: string;
    role: string;
    baseSalary: number;
    allowances?: number;
    effectiveDate: Date | string;
    dashboardUrl: string;
}

export function offerExtendedTemplate(
    firstName: string,
    data: OfferExtendedData,
): string {
    const title = 'You Have an Offer — HairLux';
    const salaryFormatted = '₦' + Number(data.baseSalary).toLocaleString();
    const allowancesLine = data.allowances
        ? `<p><strong>Allowances:</strong> ₦${Number(data.allowances).toLocaleString()}</p>`
        : '';
    const effectiveDateFormatted = new Date(data.effectiveDate).toLocaleDateString('en-NG', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'Africa/Lagos',
    });

    const body = `
    <p>Hi ${firstName},</p>
    <p>Congratulations — we're delighted to extend you an offer for the <strong>${data.role}</strong> role at HairLux.</p>
    <p><strong>Base Salary:</strong> ${salaryFormatted}</p>
    ${allowancesLine}
    <p><strong>Effective Date:</strong> ${effectiveDateFormatted}</p>
    <p>Please log in to your applicant dashboard to review the full offer and accept or decline:</p>
    <p><a href="${data.dashboardUrl}">${data.dashboardUrl}</a></p>
    <p><strong>Application Reference:</strong> ${data.applicationCode}</p>
  `;

    return baseTemplate({
        title,
        previewText: `You have an offer for ${data.role} at HairLux`,
        content: body,
    });
}