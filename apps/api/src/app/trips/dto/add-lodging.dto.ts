import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CategoryEnum, LodgingTypeEnum } from '@ltrc-campo/shared-api-model';

export class AddLodgingDto {
  @IsNotEmpty()
  @IsString()
  readonly name!: string;

  @IsEnum(LodgingTypeEnum)
  readonly type!: LodgingTypeEnum;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  readonly capacity!: number;

  @IsOptional()
  @IsString()
  readonly contactName?: string;

  @IsOptional()
  @IsString()
  readonly phone?: string;

  @IsOptional()
  @IsString()
  readonly address?: string;

  @IsOptional()
  @IsString()
  readonly notes?: string;

  @IsOptional()
  @IsEnum(CategoryEnum)
  readonly category?: CategoryEnum;
}
