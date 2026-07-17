export const QOREID_PROFILE_PHOTO_QUEUE = 'qoreid-profile-photo';

export const QOREID_PROFILE_PHOTO_JOB = 'upload-profile-photo';

export type QoreidProfilePhotoJobData = {
  userId: string;
  imageUrl: string;
  /** QoreID request / data.id when available — for logging only */
  qoreIdRequestId?: string;
};
