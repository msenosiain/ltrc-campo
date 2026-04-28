import { IsString, MinLength } from 'class-validator';

export class LookupAuthorizationDto {
  @IsString()
  @MinLength(6)
  dni!: string;
}
