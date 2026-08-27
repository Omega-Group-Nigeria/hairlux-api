/** Allowed MIME types for KYC intro videos. */
export const KYC_VIDEO_ALLOWED_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export type KycVideoContentType =
  (typeof KYC_VIDEO_ALLOWED_CONTENT_TYPES)[number];

/** Max compressed video size (~1 min with headroom). */
export const KYC_VIDEO_MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

/** Presigned PUT URL lifetime for client → R2 upload. */
export const KYC_VIDEO_UPLOAD_URL_TTL_SECONDS = 10 * 60; // 10 minutes

/** Presigned GET URL lifetime for playback / admin review. */
export const KYC_VIDEO_DOWNLOAD_URL_TTL_SECONDS = 72 * 60 * 60; // 72 hours

export const KYC_VIDEO_KEY_PREFIX = 'kyc-videos';

/** R2 multipart minimum part size (except last). Cloudflare R2 enforces 5 MB. */
export const KYC_VIDEO_PART_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Presigned multipart part URL lifetime - short for refresh flow. */
export const KYC_VIDEO_MULTIPART_TTL_SECONDS = 20 * 60; // 20 minutes

/** Client-side early reject threshold (pre-compress). */
export const KYC_VIDEO_EARLY_REJECT_BYTES = 15 * 1024 * 1024; // 15 MB raw
