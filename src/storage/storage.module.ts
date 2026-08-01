import { Module } from '@nestjs/common';
import { R2Service } from './r2.service';
import { S3Service } from './s3.service';

/**
 * Object storage:
 * - R2Service — KYC video upload/download + public admin URLs
 * - S3Service — private applicant CV uploads (presigned view)
 */
@Module({
  providers: [R2Service, S3Service],
  exports: [R2Service, S3Service],
})
export class StorageModule {}
