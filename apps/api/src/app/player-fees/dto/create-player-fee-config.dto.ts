import {
  IsArray,
  IsBoolean,
  IsDateString,
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
  @IsOptional() @IsDateString() expiresAt?: string;
}

class PriceTierDto {
  @IsDateString() validUntil!: string;
  @IsNumber() @Min(0) amountOverride!: number;
}

export class CreatePlayerFeeConfigDto {
  @IsString() @IsNotEmpty() season!: string;
  @IsEnum(SportEnum) sport!: SportEnum;
  @IsString() @IsNotEmpty() feeType!: string;
  @IsString() @IsNotEmpty() label!: string;
  @IsOptional() @IsString() description?: string;
  @IsBoolean() addMpFee!: boolean;
  @IsDateString() expiresAt!: string;
  @IsBoolean() familyDiscount!: boolean;

  @IsArray() @ValidateNested({ each: true }) @Type(() => BlockDto)
  blocks!: BlockDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PriceTierDto)
  priceTiers?: PriceTierDto[];
}
