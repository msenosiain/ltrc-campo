import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export class InternalVoteEntryDto {
  @IsString()
  @IsNotEmpty()
  awardId: string;

  @IsMongoId()
  @IsNotEmpty()
  playerId: string;
}

export class CastInternalVotesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InternalVoteEntryDto)
  votes: InternalVoteEntryDto[];
}
