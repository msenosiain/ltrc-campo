import { IsDateString, IsNotEmpty } from 'class-validator';

export class CreatePollDto {
  @IsDateString()
  @IsNotEmpty()
  startsAt: string;

  @IsDateString()
  @IsNotEmpty()
  endsAt: string;
}
