import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { VerifyNinDto } from './dto/verify-nin.dto';
import { QoreidService, QoreidRequestError } from './qoreid.service';

@Controller('nin')
export class NinController {
  constructor(private readonly qoreidService: QoreidService) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      exceptionFactory: () =>
        new HttpException(
          {
            verified: false,
            reason: 'INVALID_INPUT',
            message: 'A valid 11-digit NIN, first name, and last name are required.',
          },
          HttpStatus.BAD_REQUEST,
        ),
    }),
  )
  async verify(@Body() dto: VerifyNinDto) {
    try {
      const result = await this.qoreidService.verifyNin(dto.nin, dto.firstName, dto.lastName);

      if (!result.verified) {
        throw new HttpException(
          {
            verified: false,
            reason: 'NAME_MISMATCH',
            message:
              "We couldn't verify those details against this NIN. Please check the spelling matches your NIN slip exactly and try again.",
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      return { verified: true, bio: result.bio };
    } catch (err) {
      if (err instanceof HttpException) throw err;

      if (err instanceof QoreidRequestError && err.status === 404) {
        throw new HttpException(
          {
            verified: false,
            reason: 'NIN_NOT_FOUND',
            message: 'No record was found for that NIN. Please double-check the number and try again.',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Log full detail server-side only — never leak QoreID internals to the client.
      // eslint-disable-next-line no-console
      console.error('NIN verification error:', err);

      throw new HttpException(
        {
          verified: false,
          reason: 'VERIFICATION_UNAVAILABLE',
          message: 'Identity verification is temporarily unavailable. Please try again shortly.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}