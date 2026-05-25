import {
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export class SquadEntryDto {
  @IsInt()
  @Min(1)
  @Max(26)
  shirtNumber!: number;

  @IsMongoId()
  playerId!: string;
}

export class CreateSquadDto {
  @IsNotEmpty()
  @IsString()
  readonly name!: string;

  @IsOptional()
  @IsEnum(SportEnum)
  readonly sport?: SportEnum;

  @IsOptional()
  @IsEnum(CategoryEnum)
  readonly category?: CategoryEnum;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SquadEntryDto)
  readonly players!: SquadEntryDto[];
}
