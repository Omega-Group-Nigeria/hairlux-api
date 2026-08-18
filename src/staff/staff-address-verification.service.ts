import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { QoreidService } from '../nin/qoreid.service';
import { StaffService } from './staff.service';
import { SubmitAddressVerificationDto } from './dto/submit-address-verification.dto';

type PhotoFiles = {
    photo1?: Express.Multer.File[];
    photo2?: Express.Multer.File[];
    photo3?: Express.Multer.File[];
};

const RESUBMITTABLE_STATUSES = ['REQUESTED', 'FAILED', 'REJECTED'];

@Injectable()
export class StaffAddressVerificationService {
    private readonly logger = new Logger(StaffAddressVerificationService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly s3Service: S3Service,
        private readonly qoreidService: QoreidService,
        private readonly staffService: StaffService,
    ) { }

    async getStatus(staffId: string) {
        return this.prisma.staffAddressVerification.findUnique({ where: { staffId } });
    }

    /**
     * Admin-triggered. Upserts rather than errors on a second request --
     * requesting again after a FAILED/REJECTED outcome is a normal,
     * expected flow (something needed correcting), and this resets the
     * record to a clean REQUESTED state for the staff member to fill in
     * again, clearing whatever was submitted before.
     *
     * requestingUserId is a User.id (from the JWT) -- requestedById on
     * the record is a foreign key to Staff.id instead, so it's resolved
     * here via the acting admin's own linked Staff record (if any), same
     * pattern as StaffCompensationHistory.changedById elsewhere in this
     * codebase. A pure admin account with no Staff record correctly
     * resolves to undefined, which the schema treats as valid.
     */
    async requestVerification(staffId: string, requestingUserId?: string) {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
        if (!staff) throw new NotFoundException('Staff record not found');

        const actingStaff = requestingUserId
            ? await this.staffService.findByUserIdOrNull(requestingUserId)
            : null;
        const requestedById = (actingStaff as unknown as { id: string } | null)?.id;

        const result = await this.prisma.staffAddressVerification.upsert({
            where: { staffId },
            create: { staffId, requestedById, status: 'REQUESTED' },
            update: {
                status: 'REQUESTED',
                requestedById,
                requestedAt: new Date(),
                // Clear the previous submission -- a fresh request means a
                // fresh form, not stale data left over from a rejected attempt.
                street: null, city: null, lgaName: null, stateName: null, landmark: null,
                houseNumber: null, generalDescription: null, latitude: null, longitude: null,
                buildingDescription: null, hasGateAndFence: null, buildingStatus: null,
                buildingType: null, buildingColour: null,
                photo1Key: null, photo2Key: null, photo3Key: null, submittedAt: null,
                qoreidVerificationId: null, qoreidStatus: null, qoreidSubStatus: null,
                qoreidState: null, reportUrl: null, resultReceivedAt: null,
            },
        });

        // Critical: this is a genuinely SEPARATE onboarding item type
        // (PHYSICAL_ADDRESS_VERIFICATION) from the universal
        // ADDRESS_VERIFICATION every staff member already completes at
        // hire time -- conflating them meant resetting one silently
        // affected the other's already-settled completion state for
        // staff who'd finished onboarding long ago. This item won't
        // already exist for most staff (unlike the 6 seeded at hire), so
        // this upserts rather than find-then-update. Reset on re-request
        // is idempotent -- harmless if it was already incomplete.
        await this.prisma.staffOnboardingItem.upsert({
            where: { staffId_type: { staffId, type: 'PHYSICAL_ADDRESS_VERIFICATION' } },
            create: { staffId, type: 'PHYSICAL_ADDRESS_VERIFICATION', isComplete: false, reviewStatus: 'NOT_STARTED' },
            update: { isComplete: false, reviewStatus: 'NOT_STARTED', completedAt: null, completedBy: null, notes: null },
        });

        return result;
    }

    /**
     * Staff-triggered, from the Staff Portal. Uploads any provided photos
     * to our own S3 (for admin review without needing QoreID's report
     * URL) AND base64-encodes the same bytes to send directly in the
     * QoreID request body, per their schema.
     */
    async submit(staffId: string, dto: SubmitAddressVerificationDto, files: PhotoFiles) {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
        if (!staff) throw new NotFoundException('Staff record not found');

        const existing = await this.prisma.staffAddressVerification.findUnique({ where: { staffId } });
        if (!existing) {
            throw new BadRequestException('No address verification has been requested for this staff member yet.');
        }
        if (!RESUBMITTABLE_STATUSES.includes(existing.status)) {
            throw new BadRequestException(
                `Cannot submit -- current status is ${existing.status}. ${existing.status === 'SUBMITTED' ? 'A verification is already in progress.' : 'This has already been verified.'}`,
            );
        }
        if (!staff.phone) {
            throw new BadRequestException('Your profile has no phone number on file -- add one before submitting address verification.');
        }

        // Upload to our own S3 first (independent of what QoreID does with
        // the base64 copy) -- if this fails, nothing has been sent to
        // QoreID yet, so failing here is safe and cheap to retry.
        const photoKeys: { photo1Key?: string; photo2Key?: string; photo3Key?: string } = {};
        const photoBase64: { applicantPhoto1?: string; applicantPhoto2?: string; applicantPhoto3?: string } = {};

        const uploadPhoto = async (file: Express.Multer.File | undefined, slot: 1 | 2 | 3) => {
            if (!file) return;
            const key = await this.s3Service.uploadObject(file.buffer, 'staff/address-verification-photos', file.originalname, file.mimetype);
            (photoKeys as any)[`photo${slot}Key`] = key;
            (photoBase64 as any)[`applicantPhoto${slot}`] = file.buffer.toString('base64');
        };
        await uploadPhoto(files.photo1?.[0], 1);
        await uploadPhoto(files.photo2?.[0], 2);
        await uploadPhoto(files.photo3?.[0], 3);

        const [firstname, ...rest] = staff.name.trim().split(/\s+/);
        const result = await this.qoreidService.submitAddressVerification({
            customerReference: `staff-${staff.staffCode}`,
            street: dto.street,
            city: dto.city,
            lgaName: dto.lgaName,
            stateName: dto.stateName,
            landmark: dto.landmark,
            applicant: {
                firstname: firstname || staff.name,
                lastname: rest.join(' ') || staff.name,
                phone: staff.phone,
                dob: staff.dateOfBirth ? staff.dateOfBirth.toISOString().slice(0, 10) : undefined,
            },
            addressExtraData: {
                houseNumber: dto.houseNumber,
                generalDescription: dto.generalDescription,
                latitude: dto.latitude,
                longitude: dto.longitude,
                buildingDescription: dto.buildingDescription as 'Residential' | 'Commercial',
                hasGateAndFence: dto.hasGateAndFence,
                buildingStatus: dto.buildingStatus as 'Completed' | 'Painted' | 'Completed and Painted',
                buildingType: dto.buildingType as 'Multi-story' | 'Flats & Apartment' | 'Bungalow' | 'Office Complex',
                buildingColour: dto.buildingColour,
                ...photoBase64,
            },
        });

        const updated = await this.prisma.staffAddressVerification.update({
            where: { staffId },
            data: {
                status: 'SUBMITTED',
                street: dto.street, city: dto.city, lgaName: dto.lgaName, stateName: dto.stateName,
                landmark: dto.landmark, houseNumber: dto.houseNumber, generalDescription: dto.generalDescription,
                latitude: dto.latitude, longitude: dto.longitude, buildingDescription: dto.buildingDescription,
                hasGateAndFence: dto.hasGateAndFence, buildingStatus: dto.buildingStatus, buildingType: dto.buildingType,
                buildingColour: dto.buildingColour,
                ...photoKeys,
                submittedAt: new Date(),
                qoreidVerificationId: result.qoreidVerificationId,
                qoreidStatus: result.status,
                qoreidSubStatus: result.subStatus,
                qoreidState: result.state,
            },
        });

        // Same "SUBMITTED, awaiting review" semantics as every other
        // onboarding item -- here the "review" is QoreID's field agent,
        // not an admin directly, but the checklist state means the same
        // thing to whoever's looking at it. Guaranteed to already exist --
        // requestVerification() always upserts it before submit() can ever
        // be reached (submit() requires a StaffAddressVerification row,
        // which only requestVerification creates).
        const item = await this.prisma.staffOnboardingItem.findFirst({ where: { staffId, type: 'PHYSICAL_ADDRESS_VERIFICATION' } });
        if (item) {
            await this.prisma.staffOnboardingItem.update({
                where: { id: item.id },
                data: { reviewStatus: 'SUBMITTED', submittedAt: new Date() },
            });
        }

        return updated;
    }

    /**
     * QoreID's webhook fires once the physical visit (24-48h later) is
     * fully resolved. Maps their status.state/status onto our own
     * AddressVerificationStatus deliberately conservatively: only an
     * explicit "verified" is treated as success. Everything else that
     * reaches a COMPLETE state is REJECTED (the address genuinely
     * couldn't be confirmed); anything reaching us in a state we don't
     * recognize at all is FAILED, rather than silently guessing -- there
     * was no sample of a failed/rejected webhook payload to build this
     * mapping against directly, so staying conservative here is safer
     * than assuming a shape that turns out wrong.
     *
     * Signature verification is NOT done here -- it's already handled by
     * the existing QoreidWebhookController/QoreidWebhookService (shared
     * across every QoreID event type, since QoreID sends everything to
     * one configured webhook URL). This method is only ever called after
     * that's already passed.
     */
    async handleWebhook(payload: any) {
        const data = payload?.data;
        const verificationId = data?.id ? String(data.id) : undefined;
        const statusObj = data?.address?.status;

        if (!verificationId || !statusObj) {
            this.logger.warn(`Address verification webhook missing id or status -- ignoring. Payload: ${JSON.stringify(payload).slice(0, 500)}`);
            return;
        }

        const record = await this.prisma.staffAddressVerification.findUnique({ where: { qoreidVerificationId: verificationId } });
        if (!record) {
            this.logger.warn(`Address verification webhook for unknown verification id ${verificationId} -- ignoring.`);
            return;
        }

        const rawStatus = String(statusObj.status || '').toLowerCase();
        const rawState = String(statusObj.state || '').toLowerCase();

        let mappedStatus: 'VERIFIED' | 'REJECTED' | 'FAILED' | 'SUBMITTED' = 'SUBMITTED';
        if (rawState === 'complete') {
            mappedStatus = rawStatus === 'verified' ? 'VERIFIED' : 'REJECTED';
        } else if (rawState && rawState !== 'in_progress') {
            mappedStatus = 'FAILED';
        }

        await this.prisma.staffAddressVerification.update({
            where: { id: record.id },
            data: {
                status: mappedStatus,
                qoreidStatus: statusObj.status,
                qoreidSubStatus: statusObj.subStatus,
                qoreidState: statusObj.state,
                reportUrl: data.address?.reportURL ?? data.reportURL ?? record.reportUrl,
                resultReceivedAt: new Date(),
            },
        });

        if (mappedStatus === 'VERIFIED') {
            const item = await this.prisma.staffOnboardingItem.findFirst({ where: { staffId: record.staffId, type: 'PHYSICAL_ADDRESS_VERIFICATION' } });
            if (item && !item.isComplete) {
                await this.prisma.staffOnboardingItem.update({
                    where: { id: item.id },
                    data: { isComplete: true, completedAt: new Date(), completedBy: null, reviewStatus: 'COMPLETE' },
                });
            }
        }

        this.logger.log(`Address verification ${verificationId} (staff ${record.staffId}) resolved -> ${mappedStatus}`);
    }
}