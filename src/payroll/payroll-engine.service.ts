import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

            const [lateAgg, absentCount, commissionAgg, adjustments] = await Promise.all([
                this.prisma.attendanceRecord.aggregate({
                    where: { staffId: staff.id, date: { gte: period.periodStart, lte: period.periodEnd } },
                    _sum: { latePenaltyAmount: true },
                }),
                this.prisma.attendanceRecord.count({
                    where: { staffId: staff.id, date: { gte: period.periodStart, lte: period.periodEnd }, status: 'ABSENT' },
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
            const attendanceDeduction = absentCount * dailyRate;
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

            const grossPay = baseSalary + allowances + overtimeAmount + commissionPaid + bonusTotal;
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