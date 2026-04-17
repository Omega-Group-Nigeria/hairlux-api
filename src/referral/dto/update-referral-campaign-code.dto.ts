import { PartialType } from '@nestjs/swagger';
import { CreateReferralCampaignCodeDto } from './create-referral-campaign-code.dto';

export class UpdateReferralCampaignCodeDto extends PartialType(
  CreateReferralCampaignCodeDto,
) {}
