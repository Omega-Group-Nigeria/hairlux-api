import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { calculateMonthlyPaye } from './utils/paye-calculator';

@Injectable()
export class PayrollEngineService {
    constructor(private readonly prisma: PrismaService) { }

    async createPeriod(dto: CreatePayrollPeriodDto, actorStaffId: string | undefined) {
        const periodStart = new Date(dto.periodStart);
        const periodEnd = new Date(dto.periodEnd);
        if (periodEnd <= periodStart) {
            throw new BadRequestException('periodEnd must be after periodStart');
        }

        return this.prisma.payrollPeriod.create({
            data: { label: dto.label, periodStart, periodEnd },
        });
    }

    async listPeriods() {
        return this.prisma.payrollPeriod.findMany({
            orderBy: { periodStart: 'desc' },
            include: { _count: { select: { payslips: true } } },
        });
    }

    async getPeriod(id: string) {
        const period = await this.prisma.payrollPeriod.findUnique({
            where: { id },
            include: {
                payslips: {
                    include: { staff: { select: { id: true, name: true, staffCode: true, currentRole: true, location: { select: { name: true } } } } },
                    orderBy: { netPay: 'desc' },
                },
            },
        });
        if (!period) throw new NotFoundException('Payroll period not found');
        return period;
    }

    /**
     * A4 payslip PDF — same pdf-lib library and gold/dark brand palette as
     * the existing staff ID card generator, for visual consistency across
     * every generated document. staffId is passed in and checked here
     * (rather than trusting payslip.staffId alone) so this can be reused
     * safely by both the staff-facing "my payslip" download and any future
     * admin download, with the ownership check living in exactly one place.
     */
    async generatePayslipPdf(payslipId: string, staffId?: string): Promise<Buffer> {
        const payslip = await this.prisma.payslip.findUnique({
            where: { id: payslipId },
            include: {
                staff: { select: { id: true, name: true, staffCode: true, currentRole: true, location: { select: { name: true } } } },
                payrollPeriod: { select: { label: true, periodStart: true, periodEnd: true } },
            },
        });
        if (!payslip) throw new NotFoundException('Payslip not found');
        if (staffId && payslip.staffId !== staffId) throw new NotFoundException('Payslip not found');

        const W = 595, H = 842; // A4 portrait, points
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([W, H]);
        const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const dark = rgb(0.071, 0.063, 0.051);
        const gold = rgb(0.616, 0.510, 0.290);
        const white = rgb(1, 1, 1);
        const muted = rgb(0.45, 0.45, 0.45);
        const border = rgb(0.85, 0.85, 0.85);
        const text = rgb(0.1, 0.1, 0.1);

       
        const money = (n: unknown) => 'NGN ' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmtDate = (d: Date) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        let y = H - 40;

        // Header band
        page.drawRectangle({ x: 0, y: y - 30, width: W, height: 60, color: dark });
        page.drawText('HAIRLUX SALON & SPA', { x: 40, y: y - 5, size: 16, font: bold, color: gold });
        page.drawText('Payslip', { x: 40, y: y - 22, size: 10, font: regular, color: white });
        const periodLabel = payslip.payrollPeriod.label;
        const periodWidth = bold.widthOfTextAtSize(periodLabel, 12);
        page.drawText(periodLabel, { x: W - 40 - periodWidth, y: y - 14, size: 12, font: bold, color: white });
        y -= 70;

        // Employee info block
        const staff = payslip.staff;
        const infoLine = (label: string, value: string, x: number, rowY: number) => {
            page.drawText(label.toUpperCase(), { x, y: rowY, size: 8, font: bold, color: muted });
            page.drawText(value || '\u2014', { x, y: rowY - 13, size: 11, font: regular, color: text });
        };
        infoLine('Employee', staff.name, 40, y);
        infoLine('Staff ID', staff.staffCode ?? '\u2014', 320, y);
        y -= 40;
        infoLine('Role', staff.currentRole ?? '\u2014', 40, y);
        infoLine('Branch', staff.location?.name ?? '\u2014', 320, y);
        y -= 40;
        infoLine('Period', `${fmtDate(payslip.payrollPeriod.periodStart)} \u2013 ${fmtDate(payslip.payrollPeriod.periodEnd)}`, 40, y);
        y -= 30;

        page.drawLine({ start: { x: 40, y }, end: { x: W - 40, y }, thickness: 1, color: border });
        y -= 25;

        // Two-column earnings / deductions table
        const drawSectionHeader = (label: string, rowY: number) => {
            page.drawText(label.toUpperCase(), { x: 40, y: rowY, size: 9, font: bold, color: gold });
            page.drawLine({ start: { x: 40, y: rowY - 6 }, end: { x: W - 40, y: rowY - 6 }, thickness: 0.5, color: border });
        };
        const drawRow = (label: string, amount: unknown, rowY: number, emphasize = false) => {
            page.drawText(label, { x: 40, y: rowY, size: 10, font: emphasize ? bold : regular, color: text });
            const amtStr = money(amount);
            const amtWidth = (emphasize ? bold : regular).widthOfTextAtSize(amtStr, 10);
            page.drawText(amtStr, { x: W - 40 - amtWidth, y: rowY, size: 10, font: emphasize ? bold : regular, color: text });
        };

        drawSectionHeader('Earnings', y);
        y -= 20;
        drawRow('Base Salary', payslip.baseSalary, y); y -= 18;
        if (Number(payslip.allowances) > 0) { drawRow('Allowances', payslip.allowances, y); y -= 18; }
        if (Number(payslip.overtimeAmount) > 0) { drawRow('Overtime', payslip.overtimeAmount, y); y -= 18; }
        if (Number(payslip.commissionPaid) > 0) { drawRow('Commission', payslip.commissionPaid, y); y -= 18; }
        if (Number(payslip.bonusTotal) > 0) { drawRow('Bonus', payslip.bonusTotal, y); y -= 18; }
        if (Number(payslip.extraWorkDayEarnings) > 0) { drawRow('Extra Work Day Earnings', payslip.extraWorkDayEarnings, y); y -= 18; }
        y -= 6;
        drawRow('Gross Pay', payslip.grossPay, y, true);
        y -= 35;

        drawSectionHeader('Deductions', y);
        y -= 20;
        if (Number(payslip.attendanceDeduction) > 0) { drawRow('Absence Fees', payslip.attendanceDeduction, y); y -= 18; }
        if (Number(payslip.latePenaltyDeduction) > 0) { drawRow('Late Penalties', payslip.latePenaltyDeduction, y); y -= 18; }
        if (Number(payslip.fineTotal) > 0) { drawRow('Fines', payslip.fineTotal, y); y -= 18; }
        if (Number(payslip.loanRepayment) > 0) { drawRow('Loan Repayment', payslip.loanRepayment, y); y -= 18; }
        if (Number(payslip.taxDeduction) > 0) { drawRow('Tax (PAYE)', payslip.taxDeduction, y); y -= 18; }
        if (Number(payslip.pensionDeduction) > 0) { drawRow('Pension', payslip.pensionDeduction, y); y -= 18; }
        if (Number(payslip.otherDeductionTotal) > 0) { drawRow('Other Deductions', payslip.otherDeductionTotal, y); y -= 18; }
        y -= 6;
        drawRow('Total Deductions', payslip.totalDeductions, y, true);
        y -= 45;

        // Net pay banner
        page.drawRectangle({ x: 40, y: y - 15, width: W - 80, height: 40, color: dark });
        page.drawText('NET PAY', { x: 55, y: y, size: 11, font: bold, color: gold });
        const netStr = money(payslip.netPay);
        const netWidth = bold.widthOfTextAtSize(netStr, 16);
        page.drawText(netStr, { x: W - 55 - netWidth, y: y - 3, size: 16, font: bold, color: white });

        page.drawText(
            'This is a system-generated payslip and does not require a signature.',
            { x: 40, y: 40, size: 8, font: regular, color: muted },
        );

        const bytes = await pdfDoc.save();
        return Buffer.from(bytes);
    }

    /**
     * Running fines total for the in-progress period, so a staff member can
     * see what's accumulating toward their next payslip without waiting for
     * payroll to actually run. "Current period" is the latest DRAFT
     * PayrollPeriod if one exists; if admin hasn't created this month's
     * period yet, falls back to the current calendar month so this is never
     * just empty because of an administrative gap. Sums the same frozen
     * latePenaltyAmount/absentFeeAmount fields payroll itself sums, so this
     * number is guaranteed to match what payroll eventually charges — never
     * a separate, potentially-drifting estimate.
     */
    async getCurrentFinesForStaff(staffId: string) {
        const draftPeriod = await this.prisma.payrollPeriod.findFirst({
            where: { status: 'DRAFT' },
            orderBy: { periodStart: 'desc' },
        });

        const now = new Date();
        const periodStart = draftPeriod ? draftPeriod.periodStart : new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = draftPeriod ? draftPeriod.periodEnd : now;
        const periodLabel = draftPeriod ? draftPeriod.label : now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

        const [lateAgg, absentFeeAgg, records] = await Promise.all([
            this.prisma.attendanceRecord.aggregate({
                where: { staffId, date: { gte: periodStart, lte: periodEnd } },
                _sum: { latePenaltyAmount: true },
            }),
            this.prisma.attendanceRecord.aggregate({
                where: { staffId, date: { gte: periodStart, lte: periodEnd }, status: 'ABSENT' },
                _sum: { absentFeeAmount: true },
            }),
            this.prisma.attendanceRecord.findMany({
                where: {
                    staffId,
                    date: { gte: periodStart, lte: periodEnd },
                    OR: [{ latePenaltyAmount: { not: null } }, { absentFeeAmount: { not: null } }],
                },
                select: { date: true, status: true, lateMinutes: true, latePenaltyAmount: true, absentFeeAmount: true },
                orderBy: { date: 'desc' },
            }),
        ]);

        const latePenaltyTotal = Number(lateAgg._sum.latePenaltyAmount ?? 0);
        const absentFeeTotal = Number(absentFeeAgg._sum.absentFeeAmount ?? 0);

        return {
            periodLabel,
            periodStart,
            periodEnd,
            isDraftPeriod: !!draftPeriod,
            latePenaltyTotal,
            absentFeeTotal,
            total: latePenaltyTotal + absentFeeTotal,
            records,
        };
    }

    /**
     * The engine. For every active staff member: pulls base salary +
     * allowances (current snapshot), late-penalty deductions already
     * captured on attendance records, an attendance deduction for ABSENT
     * days, commission earned in the period (withheld from payment — not
     * from the record — in a staff member's very first payroll period when
     * salaryOnlyFirstMonth is set), manual bonus/deduction adjustments
     * already logged against this period, then applies pension and PAYE tax
     * on top. Safe to re-run while the period is still DRAFT — it always
     * recomputes from scratch rather than accumulating. Wallet crediting
     * happens right here too, at the end — matching the flow of Payroll
     * Generated → Wallet Updated → Locked, as one continuous action.
     */
    async generatePayroll(periodId: string, actorStaffId: string | undefined) {
        const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
        if (!period) throw new NotFoundException('Payroll period not found');
        if (period.status !== 'DRAFT') {
            throw new BadRequestException('Payroll can only be generated while the period is still in DRAFT');
        }

        const activeStaff = await this.prisma.staff.findMany({
            where: { employmentStatus: 'ACTIVE' },
        });

        const daysInPeriod = Math.max(1, Math.round((period.periodEnd.getTime() - period.periodStart.getTime()) / 86_400_000) + 1);
        const settings = await this.prisma.payrollSettings.findFirst();
        const pensionRate = settings ? Number(settings.pensionRate) : 0.08;
        const createdPayslips = [];

        for (const staff of activeStaff) {
            const baseSalary = Number(staff.currentBaseSalary ?? 0);
            const allowances = Number(staff.currentAllowances ?? 0);

            // Has this staff member ever had a payslip before? If not, this
            // is their first payroll period.
            const priorPayslip = await this.prisma.payslip.findFirst({ where: { staffId: staff.id } });
            const isFirstMonth = !priorPayslip;

            const [lateAgg, absentFeeAgg, approvedExtraWorkDayCount, commissionAgg, adjustments] = await Promise.all([
                this.prisma.attendanceRecord.aggregate({
                    where: { staffId: staff.id, date: { gte: period.periodStart, lte: period.periodEnd } },
                    _sum: { latePenaltyAmount: true },
                }),
                // absentFeeAmount is frozen on each record the moment ABSENT is
                // recorded (see AttendanceService.calculateAbsentFee) — summed
                // here, never recomputed, so payroll always matches exactly what
                // staff were already shown on their Attendance screen, and never
                // drifts if the penalty rate changes between the absence and
                // when payroll actually runs.
                this.prisma.attendanceRecord.aggregate({
                    where: { staffId: staff.id, date: { gte: period.periodStart, lte: period.periodEnd }, status: 'ABSENT' },
                    _sum: { absentFeeAmount: true },
                }),
                // HCS v1.0 Part B, Phase 3 — only APPROVED extra work days count; still-pending
                // or rejected ones earn nothing until (or unless) approved.
                this.prisma.attendanceRecord.count({
                    where: {
                        staffId: staff.id,
                        date: { gte: period.periodStart, lte: period.periodEnd },
                        status: 'EXTRA_WORK_DAY_PENDING',
                        extraWorkDayApproval: 'APPROVED',
                    },
                }),
                this.prisma.salonBookingCommission.aggregate({
                    where: { staffId: staff.id, calculatedAt: { gte: period.periodStart, lte: period.periodEnd } },
                    _sum: { amount: true },
                }),
                this.prisma.payrollAdjustment.findMany({
                    where: { staffId: staff.id, payrollPeriodId: periodId },
                }),
            ]);

            const latePenaltyDeduction = Number(lateAgg._sum.latePenaltyAmount ?? 0);
            const dailyRate = baseSalary / daysInPeriod;
            const attendanceDeduction = Number(absentFeeAgg._sum.absentFeeAmount ?? 0);
            const extraWorkDayEarnings = approvedExtraWorkDayCount * dailyRate;
            const commissionEarned = Number(commissionAgg._sum.amount ?? 0);
            const commissionPaid = isFirstMonth && staff.salaryOnlyFirstMonth ? 0 : commissionEarned;

            const bonusTotal = adjustments.filter((a) => a.type === 'BONUS').reduce((sum, a) => sum + Number(a.amount), 0);
            const deductionAdjustments = adjustments.filter((a) => a.type === 'DEDUCTION');
            const loanRepayment = deductionAdjustments
                .filter((a) => a.category.toLowerCase().includes('loan'))
                .reduce((sum, a) => sum + Number(a.amount), 0);
            const fineTotal = deductionAdjustments
                .filter((a) => {
                    const c = a.category.toLowerCase();
                    return c.includes('damage') || c.includes('shortage') || c.includes('penalt') || c.includes('fine');
                })
                .reduce((sum, a) => sum + Number(a.amount), 0);
            const otherDeductionTotal = deductionAdjustments
                .filter((a) => {
                    const c = a.category.toLowerCase();
                    return !c.includes('loan') && !c.includes('damage') && !c.includes('shortage') && !c.includes('penalt') && !c.includes('fine');
                })
                .reduce((sum, a) => sum + Number(a.amount), 0);

            const overtimeAmount = 0; // no overtime-rate tracking exists yet — always 0 until that's built

            const grossPay = baseSalary + allowances + overtimeAmount + commissionPaid + bonusTotal + extraWorkDayEarnings;
            const pensionDeduction = (baseSalary + allowances) * pensionRate;
            const taxableIncome = grossPay - pensionDeduction;
            const taxDeduction = calculateMonthlyPaye(taxableIncome);

            const totalDeductions =
                attendanceDeduction + latePenaltyDeduction + fineTotal + loanRepayment + taxDeduction + pensionDeduction + otherDeductionTotal;
            const netPay = grossPay - totalDeductions;

            const payslip = await this.prisma.payslip.upsert({
                where: { payrollPeriodId_staffId: { payrollPeriodId: periodId, staffId: staff.id } },
                create: {
                    payrollPeriodId: periodId,
                    staffId: staff.id,
                    baseSalary,
                    allowances,
                    overtimeAmount,
                    commissionEarned,
                    commissionPaid,
                    bonusTotal,
                    extraWorkDayEarnings,
                    attendanceDeduction,
                    latePenaltyDeduction,
                    fineTotal,
                    loanRepayment,
                    taxDeduction,
                    pensionDeduction,
                    otherDeductionTotal,
                    grossPay,
                    totalDeductions,
                    netPay,
                    isFirstMonth,
                },
                update: {
                    baseSalary,
                    allowances,
                    overtimeAmount,
                    commissionEarned,
                    commissionPaid,
                    bonusTotal,
                    extraWorkDayEarnings,
                    attendanceDeduction,
                    latePenaltyDeduction,
                    fineTotal,
                    loanRepayment,
                    taxDeduction,
                    pensionDeduction,
                    otherDeductionTotal,
                    grossPay,
                    totalDeductions,
                    netPay,
                    isFirstMonth,
                },
            });

            // Link this period's adjustments to the now-created payslip.
            if (adjustments.length) {
                await this.prisma.payrollAdjustment.updateMany({
                    where: { id: { in: adjustments.map((a) => a.id) } },
                    data: { payslipId: payslip.id },
                });
            }

            createdPayslips.push(payslip);
        }

        for (const payslip of createdPayslips) {
            const wallet = await this.prisma.staffWallet.upsert({
                where: { staffId: payslip.staffId },
                create: { staffId: payslip.staffId, balance: 0 },
                update: {},
            });

            await this.prisma.$transaction([
                this.prisma.staffWallet.update({
                    where: { id: wallet.id },
                    data: { balance: { increment: payslip.netPay } },
                }),
                this.prisma.staffWalletTransaction.create({
                    data: {
                        walletId: wallet.id,
                        type: 'PAYROLL_CREDIT',
                        amount: payslip.netPay,
                        status: 'COMPLETED',
                        reference: `PAYROLL-${periodId}-${payslip.staffId}`,
                        description: `Net salary for this payroll period`,
                    },
                }),
            ]);
        }

        return this.prisma.payrollPeriod.update({
            where: { id: periodId },
            data: { status: 'AWAITING_RELEASE', generatedAt: new Date(), generatedById: actorStaffId },
        });
    }
}