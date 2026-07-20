/** Allowed MIME types for KYC intro videos. */
export const KYC_VIDEO_ALLOWED_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export type KycVideoContentType =
  (typeof KYC_VIDEO_ALLOWED_CONTENT_TYPES)[number];

/** Max compressed video size (~1 min highly compressed with headroom). */
export const KYC_VIDEO_MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

/** Presigned PUT URL lifetime for client → R2 upload. */
export const KYC_VIDEO_UPLOAD_URL_TTL_SECONDS = 10 * 60; // 10 minutes

/** Presigned GET URL lifetime for playback / admin review. */
export const KYC_VIDEO_DOWNLOAD_URL_TTL_SECONDS = 72 * 60 * 60; // 72 hours

export const KYC_VIDEO_KEY_PREFIX = 'kyc-videos';
