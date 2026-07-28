import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  CategoryEnum,
  HockeyBranchEnum,
  MatchStatusEnum,
  SportEnum,
} from '@ltrc-campo/shared-api-model';

export class CreateMatchBulkDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  readonly date!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'time must be in HH:mm format' })
  readonly time?: string;

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

  @IsOptional()
  @IsEnum(SportEnum)
  readonly sport?: SportEnum;

  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(CategoryEnum, { each: true })
  readonly categories!: CategoryEnum[];

  @IsOptional()
  @IsEnum(HockeyBranchEnum)
  readonly branch?: HockeyBranchEnum;

  @IsOptional()
  @IsMongoId()
  readonly tournament?: string;

  @IsOptional()
  @IsString()
  readonly notes?: string;
}
