/**
 * Nigerian PAYE tax calculation — Nigeria Tax Act 2025 bands, effective
 * 1 January 2026. The old Consolidated Relief Allowance (CRA) is abolished;
 * the first ₦800,000 of annual taxable income is tax-free, then progressive
 * bands apply. This is a simplified implementation:
 *   - Does NOT account for rent relief (up to ₦200,000/year with proof of
 *     rent paid) since Hairlux doesn't currently collect that data from staff.
 *   - Pension is applied to (base salary + allowances) as a whole, rather
 *     than the stricter "basic + housing + transport" pensionable-components
 *     breakdown, since Staff compensation isn't currently split that way.
 *
 * This should be treated as a configurable starting point, not a guarantee
 * of exact statutory compliance — worth a review by Hairlux's accountant
 * before relying on it for real disbursement and remittance.
 */

const ANNUAL_TAX_BANDS: { upTo: number; rate: number }[] = [
    { upTo: 800_000, rate: 0 },
    { upTo: 3_000_000, rate: 0.15 },
    { upTo: 12_000_000, rate: 0.18 },
    { upTo: 25_000_000, rate: 0.21 },
    { upTo: 50_000_000, rate: 0.23 },
    { upTo: Infinity, rate: 0.25 },
];

/**
 * @param monthlyTaxableIncome Gross pay for the month minus pension (and any
 * other pre-tax deductions already applied).
 * @returns The monthly PAYE amount.
 */
export function calculateMonthlyPaye(monthlyTaxableIncome: number): number {
    if (monthlyTaxableIncome <= 0) return 0;

    const annualTaxableIncome = monthlyTaxableIncome * 12;
    let remaining = annualTaxableIncome;
    let previousUpTo = 0;
    let annualTax = 0;

    for (const band of ANNUAL_TAX_BANDS) {
        const bandSize = band.upTo - previousUpTo;
        const amountInBand = Math.min(remaining, bandSize);
        if (amountInBand > 0) {
            annualTax += amountInBand * band.rate;
            remaining -= amountInBand;
        }
        previousUpTo = band.upTo;
        if (remaining <= 0) break;
    }

    return annualTax / 12;
}