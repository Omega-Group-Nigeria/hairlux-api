import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AppService } from './app.service';
import { MailService } from './mail/mail.service';
import { ContactFormDto } from './app/dto/contact-form.dto';
import { ResponseUtil } from './common/utils/response.util';

@ApiTags('Public')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly mailService: MailService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('contact')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Submit contact form',
    description:
      'Receives contact form submission and forwards it to CONTACT_EMAIL via SMTP template.',
  })
  @ApiBody({ type: ContactFormDto })
  @ApiResponse({
    status: 200,
    description: 'Contact request submitted successfully',
    schema: {
      example: {
        success: true,
        message: 'Contact request submitted successfully',
        data: {
          accepted: true,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async submitContactForm(@Body() body: ContactFormDto) {
    await this.mailService.sendContactFormEmail(body);

    return ResponseUtil.success(
      { accepted: true },
      'Contact request submitted successfully',
    );
  }
}
