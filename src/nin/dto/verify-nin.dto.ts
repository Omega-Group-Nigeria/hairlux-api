import { IsNotEmpty, IsString, Matches } from 'class-validator';
 
export class VerifyNinDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: 'nin must be exactly 11 digits' })
  nin: string;
 
  @IsString()
  @IsNotEmpty()
  firstName: string;
 
  @IsString()
  @IsNotEmpty()
  lastName: string;
}
 