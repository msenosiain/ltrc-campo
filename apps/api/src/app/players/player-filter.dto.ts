import { IsOptional, IsString, IsEnum, IsIn, IsBoolean, IsArray, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  CategoryEnum,
  HockeyBranchEnum,
  HockeyPositions,
  PlayerAvailabilityEnum,
  PlayerPosition,
  PlayerStatusEnum,
  RugbyPositions,
  SportEnum,
} from '@ltrc-campo/shared-api-model';

export class PlayerFiltersDto {
  @IsOptional()
  @IsString()
  searchTerm?: string;

  @IsOptional()
  @IsEnum(SportEnum)
  sport?: SportEnum;

  @IsOptional()
  @IsIn([
    ...new Set([
      ...Object.values(RugbyPositions),
      ...Object.values(HockeyPositions),
    ]),
  ])
  position?: PlayerPosition; // filters by positions array ($in)

  @IsOptional()
  @IsEnum(CategoryEnum)
  category?: CategoryEnum;

  @IsOptional()
  @IsArray()
  @IsEnum(CategoryEnum, { each: true })
  categories?: CategoryEnum[];

  @IsOptional()
  @IsEnum(HockeyBranchEnum)
  branch?: HockeyBranchEnum;

  @IsOptional()
  @IsEnum(PlayerStatusEnum)
  status?: PlayerStatusEnum;

  @IsOptional()
  @IsEnum(PlayerAvailabilityEnum)
  availability?: PlayerAvailabilityEnum;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  availableForTraining?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  noPosition?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  playerIds?: string[];
}
