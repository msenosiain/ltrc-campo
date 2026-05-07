import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';

class BlockDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsArray() @IsEnum(CategoryEnum, { each: true }) categories!: CategoryEnum[];
  @IsNumber() @Min(0) amount!: number;
  @IsString() @IsNotEmpty() expiresAt!: string;
}

export class CreatePlayerFeeConfigDto {
  @IsString() @IsNotEmpty() season!: string;
  @IsEnum(SportEnum) sport!: SportEnum;
  @IsString() @IsNotEmpty() feeType!: string;
  @IsString() @IsNotEmpty() label!: string;
  @IsOptional() @IsString() description?: string;
  @IsBoolean() addMpFee!: boolean;
  @IsBoolean() familyDiscount!: boolean;

  @IsArray() @ValidateNested({ each: true }) @Type(() => BlockDto)
  blocks!: BlockDto[];
}
