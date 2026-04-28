import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { Transform, Type } from 'class-transformer';
import {
  CategoryEnum,
  HockeyBranchEnum,
  MatchStatusEnum,
  SportEnum,
  parseDate,
} from '@ltrc-campo/shared-api-model';

export class VideoClipDto {
  @IsUrl()
  url!: string;

  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  targetPlayers?: string[];
}

export class SquadEntryDto {
  @IsInt()
  @Min(1)
  @Max(99)
  shirtNumber!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  dorsalNumber?: number;

  @IsOptional()
  @IsBoolean()
  isCaptain?: boolean;

  @IsOptional()
  @IsString()
  posterLabel?: string;

  @IsMongoId()
  playerId!: string;
}

export class MatchDayStaffDto {
  @IsOptional()
  @IsString()
  referee?: string;

  @IsOptional()
  @IsString()
  ar1?: string;

  @IsOptional()
  @IsString()
  ar2?: string;

  @IsOptional()
  @IsString()
  headCoach?: string;
}

export class MatchResultDto {
  @IsNumber()
  @Min(0)
  homeScore!: number;

  @IsNumber()
  @Min(0)
  awayScore!: number;
}

export class CreateMatchDto {
  @IsNotEmpty()
  @Transform(({ value }) => parseDate(value))
  @IsDate({ message: '$property must be a valid date (dd/MM/yyyy)' })
  readonly date!: Date;

  @IsOptional()
  @IsString()
  readonly name?: string;

  @IsOptional()
  @IsString()
  readonly opponent?: string;

  @IsNotEmpty()
  @IsString()
  readonly venue!: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  readonly isHome?: boolean;

  @IsOptional()
  @IsEnum(MatchStatusEnum)
  readonly status?: MatchStatusEnum;

  @IsEnum(SportEnum)
  readonly sport!: SportEnum;

  @IsNotEmpty()
  @IsEnum(CategoryEnum)
  readonly category!: CategoryEnum;

  @IsOptional()
  @IsString()
  readonly division?: string;

  @IsOptional()
  @IsEnum(HockeyBranchEnum)
  readonly branch?: HockeyBranchEnum;

  @IsOptional()
  @IsMongoId()
  readonly tournament?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SquadEntryDto)
  readonly squad?: SquadEntryDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VideoClipDto)
  readonly videos?: VideoClipDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => MatchResultDto)
  readonly result?: MatchResultDto;

  @IsOptional()
  @IsString()
  readonly notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MatchDayStaffDto)
  readonly matchDay?: MatchDayStaffDto;
}
