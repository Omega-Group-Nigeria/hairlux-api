import { PartialType } from '@nestjs/mapped-types';
import { CreateAnnouncementDto } from './create-announcement.dto';

/**
 * PartialType mirrors CreateAnnouncementDto's exact fields and validation
 * rules automatically (all made optional) — safer than hand-duplicating
 * them here, since it can never silently drift out of sync if
 * CreateAnnouncementDto changes later.
 */
export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) { }