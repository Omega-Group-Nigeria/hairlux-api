import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class JoinRoomsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  rooms: string[];
}