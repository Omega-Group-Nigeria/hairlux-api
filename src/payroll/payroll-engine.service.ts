import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { calculateMonthlyPaye } from './utils/paye-calculator';
import { PayrollAuditService } from './payroll-audit.service';
import { PayrollSalaryCalculatorService } from './payroll-salary-calculator.service';
import { SystemAuditService } from '../common/services/system-audit.service';

@Injectable()
export class PayrollEngineService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly payrollAuditService: PayrollAuditService,
        private readonly salaryCalculator: PayrollSalaryCalculatorService,
        private readonly systemAuditService: SystemAuditService,
    ) { }

    async createPeriod(dto: CreatePayrollPeriodDto, actorStaffId: string | undefined) {
        const periodStart = new Date(dto.periodStart);
        const periodEnd = new Date(dto.periodEnd);
        if (periodEnd <= periodStart) {
            throw new BadRequestException('periodEnd must be after periodStart');
        }

        // Dev Feedback Round 4, item #18-19: without this, two periods
        // with overlapping (or identical) date ranges would each
        // independently sum the SAME underlying attendance records' late
        // penalties/absence fees -- a genuine double-deduction across two
        // separate payslips for the same staff member, for the same
        // underlying lateness/absence event. Standard range-overlap
        // check: two ranges overlap unless one ends strictly before the
        // other begins.
        const overlapping = await this.prisma.payrollPeriod.findFirst({
            where: {
                periodStart: { lte: periodEnd },
                periodEnd: { gte: periodStart },
            },
        });
        if (overlapping) {
            throw new BadRequestException(
                `This date range overlaps an existing payroll period ("${overlapping.label}", ${overlapping.periodStart.toDateString()} \u2013 ${overlapping.periodEnd.toDateString()}) -- attendance deductions would be double-counted across both.`,
            );
        }

        const created = await this.prisma.payrollPeriod.create({
            data: { label: dto.label, periodStart, periodEnd },
        });

        await this.payrollAuditService.log({
            action: 'PERIOD_CREATED',
            entityType: 'PayrollPeriod',
            entityId: created.id,
            actorId: actorStaffId,
            after: { label: created.label, periodStart: created.periodStart, periodEnd: created.periodEnd },
        });

        return created;
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

        // Guide, section 15/16: "Log payslip viewing and downloading."
        // Placed in this shared method (not the controller) so it's
        // caught for any future caller of this same method, not just
        // today's one staff-portal download path.
        await this.systemAuditService.log({
            action: 'PAYSLIP_DOWNLOADED',
            entityType: 'Payslip',
            entityId: payslip.id,
            staffId: payslip.staffId,
            actorId: staffId,
        });

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
     * from the record — in a staff member's very first payroll period for
     * SALARY_TO_COMMISSION staff), manual bonus/deduction adjustments
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

        const settings = await this.prisma.payrollSettings.findFirst();
        const pensionRate = settings ? Number(settings.pensionRate) : 0.08;
        const cutoffDay = settings?.salaryToCommissionCutoffDay ?? 15;
        const createdPayslips = [];

        for (const staff of activeStaff) {
            const { payslipData, adjustments } = await this.computePayslipFigures(staff, period, periodId, pensionRate, cutoffDay);

            // Human-readable, unique reference -- assigned once, at
            // creation, never regenerated on a later re-run of the same
            // period. "Active" here means not SUPERSEDED (per the partial
            // unique index this now relies on instead of a plain compound
            // unique constraint -- see migration 20260827160000).
            const existingPayslip = await this.prisma.payslip.findFirst({
                where: { payrollPeriodId: periodId, staffId: staff.id, status: { not: 'SUPERSEDED' } },
                select: { id: true, payslipReference: true },
            });
            const payslipReference = existingPayslip?.payslipReference
                ?? `HL-${period.label.replace(/\s+/g, '').toUpperCase()}-${staff.staffCode}`;

            // Explicit find-then-create/update rather than Prisma's native
            // upsert() -- upsert() requires a compound-unique constraint
            // Prisma itself declares, which this table no longer has (see
            // the schema.prisma comment on the @@index just above the old
            // @@unique it replaced). status is only ever set on create,
            // deliberately absent from payslipData used by both branches --
            // payslips only become PUBLISHED when the period itself is
            // approved (RELEASED), which happens strictly after generation.
            // A re-run while still AWAITING_RELEASE (a correction sends it
            // back to DRAFT first) always finds the payslip still DRAFT, so
            // there's nothing to preserve/protect here -- generation and
            // publishing never overlap in time.
            const payslip = existingPayslip
                ? await this.prisma.payslip.update({
                    where: { id: existingPayslip.id },
                    data: payslipData,
                })
                : await this.prisma.payslip.create({
                    data: {
                        payrollPeriodId: periodId,
                        staffId: staff.id,
                        payslipReference,
                        status: 'DRAFT',
                        ...payslipData,
                    },
                });

            // Link this period's adjustments to the now-created payslip.
            if (adjustments.length) {
                await this.prisma.payrollAdjustment.updateMany({
                    where: { id: { in: adjustments.map((a: { id: string }) => a.id) } },
                    data: { payslipId: payslip.id },
                });
            }

            createdPayslips.push(payslip);
        }

        for (const payslip of createdPayslips) {
            // Dev Feedback Round 7, item #9: reference is deterministic
            // (periodId + staffId), by design, so a re-run correctly finds
            // and reuses the same payslip (see the comment on that logic
            // above) -- but this loop had no matching guard, so it always
            // tried to create a second wallet transaction with that same
            // reference, crashing on the unique constraint. Skipping both
            // the balance increment and the transaction together when one
            // already exists for this exact reference makes the whole
            // operation safely re-runnable rather than crashing, matching
            // the payslip logic's own re-run design intent.
            //
            // Known limitation: if a correction changed this payslip's
            // netPay since the wallet was first credited, this skip does
            // NOT reconcile the wallet to the new amount -- it leaves the
            // original credit as-is. Flagged rather than solved here,
            // since reconciling would need a signed adjustment entry (or
            // similar) and this fix's own priority was stopping the crash
            // that currently blocks generation entirely, every time.
            const reference = `PAYROLL-${periodId}-${payslip.staffId}`;
            const existingTransaction = await this.prisma.staffWalletTransaction.findUnique({ where: { reference } });
            if (existingTransaction) continue;

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
                        reference,
                        description: `Net salary for this payroll period`,
                    },
                }),
            ]);
        }

        const updatedPeriod = await this.prisma.payrollPeriod.update({
            where: { id: periodId },
            data: { status: 'AWAITING_RELEASE', generatedAt: new Date(), generatedById: actorStaffId },
        });

        await this.payrollAuditService.log({
            action: 'PAYROLL_GENERATED',
            entityType: 'PayrollPeriod',
            entityId: periodId,
            actorId: actorStaffId,
            note: `${createdPayslips.length} payslip(s) generated`,
            before: { status: period.status },
            after: { status: updatedPeriod.status },
        });

        return updatedPeriod;
    }

    /**
     * The shared calculation core behind both generatePayroll() (looping
     * over every active staff member) and correctPayslip() (recalculating
     * one staff member's figures fresh, against current data, for a
     * correction). Deliberately returns the figures without persisting
     * anything -- each caller decides how to save them (find-then-update
     * for a normal re-run, vs. supersede-and-create-new for a correction),
     * since those two persistence shapes are genuinely different.
     */
    private async computePayslipFigures(
        staff: any,
        period: { id: string; label: string; periodStart: Date; periodEnd: Date },
        periodId: string,
        pensionRate: number,
        cutoffDay: number,
    ) {
        const baseSalary = Number(staff.currentBaseSalary ?? 0);
        const allowances = Number(staff.currentAllowances ?? 0);

        // Has this staff member ever had a payslip before? Still a
        // useful display flag for Phase 3 (guide, section 15: "show...
        // employee start date... only when relevant... first
        // applicable payroll month") -- no longer used for any
        // commission-zeroing logic, since the SALARY_TO_COMMISSION
        // cutoff rule now produces that naturally on its own.
        const priorPayslip = await this.prisma.payslip.findFirst({ where: { staffId: staff.id } });
        const isFirstMonth = !priorPayslip;

        const [lateAgg, absentFeeAgg, adjustments, calc] = await Promise.all([
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
            this.prisma.payrollAdjustment.findMany({
                where: { staffId: staff.id, payrollPeriodId: periodId },
            }),
            // Payroll System Developer Implementation Guide: full-month
            // scheduled-workday proration, CompensationType handling,
            // and the 15th cutoff rule -- see PayrollSalaryCalculatorService.
            this.salaryCalculator.calculateForStaff(
                { id: staff.id, hireDate: staff.hireDate, compensationType: staff.compensationType, currentBaseSalary: staff.currentBaseSalary, commissionRate: staff.commissionRate, commissionPlanId: staff.commissionPlanId },
                period.periodStart,
                period.periodEnd,
                cutoffDay,
            ),
        ]);

        const latePenaltyDeduction = Number(lateAgg._sum.latePenaltyAmount ?? 0);
        const attendanceDeduction = Number(absentFeeAgg._sum.absentFeeAmount ?? 0);
        const commissionEarned = calc.commissionEarned;
        // No more "withheld in the first month" concept -- under the
        // new model, a period that falls entirely within the salary
        // window naturally earns zero commission (calc.commissionEarned
        // is already 0 in that case), rather than needing a separate
        // zeroing step here.
        const commissionPaid = commissionEarned;

        const bonusTotal = adjustments.filter((a: any) => a.type === 'BONUS').reduce((sum: number, a: any) => sum + Number(a.amount), 0);
        const deductionAdjustments = adjustments.filter((a: any) => a.type === 'DEDUCTION');
        const loanRepayment = deductionAdjustments
            .filter((a: any) => a.category.toLowerCase().includes('loan'))
            .reduce((sum: number, a: any) => sum + Number(a.amount), 0);
        const fineTotal = deductionAdjustments
            .filter((a: any) => {
                const c = a.category.toLowerCase();
                return c.includes('damage') || c.includes('shortage') || c.includes('penalt') || c.includes('fine');
            })
            .reduce((sum: number, a: any) => sum + Number(a.amount), 0);
        const otherDeductionTotal = deductionAdjustments
            .filter((a: any) => {
                const c = a.category.toLowerCase();
                return !c.includes('loan') && !c.includes('damage') && !c.includes('shortage') && !c.includes('penalt') && !c.includes('fine');
            })
            .reduce((sum: number, a: any) => sum + Number(a.amount), 0);

        const overtimeAmount = 0; // no overtime-rate tracking exists yet — always 0 until that's built

        const grossPay = baseSalary + allowances + overtimeAmount + commissionPaid + bonusTotal + calc.extraWorkDayEarnings;
        const pensionDeduction = (baseSalary + allowances) * pensionRate;
        const taxableIncome = grossPay - pensionDeduction;
        const taxDeduction = calculateMonthlyPaye(taxableIncome);

        const totalDeductions =
            attendanceDeduction + latePenaltyDeduction + fineTotal + loanRepayment + taxDeduction + pensionDeduction + otherDeductionTotal;
        const netPay = grossPay - totalDeductions;

        const payslipData = {
            baseSalary,
            allowances,
            overtimeAmount,
            commissionEarned,
            commissionPaid,
            bonusTotal,
            extraWorkDayEarnings: calc.extraWorkDayEarnings,
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
            salaryEffectiveDate: calc.salaryEffectiveDate,
            fullMonthScheduledWorkdays: calc.fullMonthScheduledWorkdays,
            applicableScheduledWorkdays: calc.applicableScheduledWorkdays,
            missedWorkdays: calc.missedWorkdays,
            approvedExtraWorkdaysCount: calc.approvedExtraWorkdaysCount,
            payableWorkdays: calc.payableWorkdays,
            dailyRate: calc.dailyRate,
            salaryEarned: calc.salaryEarned,
            staffHireDateSnapshot: calc.staffHireDateSnapshot,
            cutoffDayUsed: calc.cutoffDayUsed,
            cutoffClassification: calc.cutoffClassification,
            salaryPeriodStart: calc.salaryPeriodStart,
            salaryPeriodEnd: calc.salaryPeriodEnd,
            commissionPeriodStart: calc.commissionPeriodStart,
            commissionPeriodEnd: calc.commissionPeriodEnd,
            transitionDate: calc.transitionDate,
            commissionPlanIdUsed: staff.commissionPlanId,
            commissionRateUsed: staff.commissionRate,
        };

        return { payslipData, adjustments };
    }

    /**
     * Payroll System Developer Implementation Guide, section 15, "Staff
     * portal and download requirements" #5: "Corrections must retain the
     * original, mark it as superseded, generate a replacement, and show
     * the correction reference." The original payslip row is never
     * mutated or deleted -- it flips to SUPERSEDED and a brand-new row is
     * created alongside it (supersedesId links the two), recalculated
     * fresh against whatever is true right now (a new adjustment added
     * since the original ran is exactly the kind of thing a correction
     * exists to pick up).
     */
    async correctPayslip(payslipId: string, reason: string, actorId: string | undefined) {
        const original = await this.prisma.payslip.findUnique({
            where: { id: payslipId },
            include: { payrollPeriod: true, staff: true },
        });
        if (!original) throw new NotFoundException('Payslip not found');
        if (!['PUBLISHED', 'CORRECTED'].includes(original.status)) {
            throw new BadRequestException('Only a published (or already-corrected) payslip can be corrected');
        }
        if (original.payrollPeriod.status !== 'RELEASED') {
            throw new BadRequestException('The payroll period for this payslip is not in a released state');
        }

        const settings = await this.prisma.payrollSettings.findFirst();
        const pensionRate = settings ? Number(settings.pensionRate) : 0.08;
        const cutoffDay = settings?.salaryToCommissionCutoffDay ?? 15;

        const { payslipData, adjustments } = await this.computePayslipFigures(
            original.staff, original.payrollPeriod, original.payrollPeriodId, pensionRate, cutoffDay,
        );

        // How many times has this (period, staff) pair already been
        // corrected? Determines the new reference's suffix -- each
        // correction in the chain gets a distinct, traceable reference.
        const priorCorrections = await this.prisma.payslip.count({
            where: { payrollPeriodId: original.payrollPeriodId, staffId: original.staffId, status: 'SUPERSEDED' },
        });
        const correctedReference = `${original.payslipReference.replace(/-C\d+$/, '')}-C${priorCorrections + 1}`;

        const [supersededOriginal, newPayslip] = await this.prisma.$transaction([
            this.prisma.payslip.update({
                where: { id: original.id },
                data: { status: 'SUPERSEDED' },
            }),
            this.prisma.payslip.create({
                data: {
                    payrollPeriodId: original.payrollPeriodId,
                    staffId: original.staffId,
                    payslipReference: correctedReference,
                    status: 'CORRECTED',
                    supersedesId: original.id,
                    correctionReference: reason,
                    publishedAt: new Date(),
                    ...payslipData,
                },
            }),
        ]);

        if (adjustments.length) {
            await this.prisma.payrollAdjustment.updateMany({
                where: { id: { in: adjustments.map((a: { id: string }) => a.id) } },
                data: { payslipId: newPayslip.id },
            });
        }

        // Guide, section 15/17: "Log every correction or regeneration with
        // user, timestamp, reason, and payroll period."
        await this.systemAuditService.log({
            action: 'PAYSLIP_CORRECTED',
            entityType: 'Payslip',
            entityId: newPayslip.id,
            staffId: original.staffId,
            actorId,
            note: reason,
            before: { payslipId: original.id, netPay: original.netPay },
            after: { payslipId: newPayslip.id, netPay: newPayslip.netPay },
        });

        return newPayslip;
    }
}