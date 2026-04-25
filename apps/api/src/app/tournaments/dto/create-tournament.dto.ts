import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CategoryEnum, MatchTypeEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export class CreateTournamentDto {
  @IsNotEmpty()
  @IsString()
  readonly name!: string;

  @IsOptional()
  @IsString()
  readonly season?: string;

  @IsOptional()
  @IsString()
  readonly description?: string;

  @IsOptional()
  @IsEnum(SportEnum)
  @Transform(({ value }) => value ?? undefined)
  readonly sport?: SportEnum;

  @IsOptional()
  @IsArray()
  @IsEnum(CategoryEnum, { each: true })
  readonly categories?: CategoryEnum[];

  @IsOptional()
  @IsEnum(MatchTypeEnum)
  @Transform(({ value }) => value ?? undefined)
  readonly type?: MatchTypeEnum;

}
