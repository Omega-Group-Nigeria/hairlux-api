import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { StaffService } from './staff.service';

@ApiTags('Staff - Self Service')
@ApiBearerAuth('JWT-auth')
@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF)
export class StaffSelfController {
  constructor(private readonly staffService: StaffService) {}

  @Get('me')
  @ApiOperation({ summary: "Get the logged-in staff member's own record" })
  @ApiResponse({ status: 200, description: 'Staff record retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - JWT missing or invalid' })
  @ApiResponse({ status: 403, description: 'Forbidden - account has no STAFF role' })
  @ApiResponse({ status: 404, description: 'No staff record linked to this account' })
  async getMe(@Req() req: any) {
    const data = await this.staffService.findByUserId(req.user.id);
    return { success: true, message: 'Staff record retrieved successfully', data };
  }
}