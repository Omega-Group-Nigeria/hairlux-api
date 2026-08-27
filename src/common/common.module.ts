import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GeocodingService } from './services/geocoding.service';
import { SystemAuditService } from './services/system-audit.service';

@Global()
@Module({
  imports: [HttpModule],
  providers: [GeocodingService, SystemAuditService],
  exports: [GeocodingService, SystemAuditService],
})
export class CommonModule { }