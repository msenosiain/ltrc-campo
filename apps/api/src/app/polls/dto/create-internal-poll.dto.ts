import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export class AwardInputDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CreateInternalPollDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AwardInputDto)
  awards: AwardInputDto[];

  @IsDateString()
  @IsNotEmpty()
  startsAt: string;

  @IsDateString()
  @IsNotEmpty()
  endsAt: string;

  @IsArray()
  @IsMongoId({ each: true })
  staffVoterIds: string[];
}
