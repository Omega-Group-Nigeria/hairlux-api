import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AfricasTalkingService } from './africas-talking.service';

@Module({
    imports: [HttpModule],
    providers: [AfricasTalkingService],
    exports: [AfricasTalkingService],
})
export class SmsModule { }