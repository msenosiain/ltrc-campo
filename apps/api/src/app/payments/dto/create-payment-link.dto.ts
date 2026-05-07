import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentEntityTypeEnum, PaymentTypeEnum } from '@ltrc-campo/shared-api-model';

export class CreatePaymentLinkDto {
  @IsEnum(PaymentEntityTypeEnum)
  readonly entityType!: PaymentEntityTypeEnum;

  @IsOptional()
  @IsString()
  readonly entityId?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  readonly entityIds?: string[];

  @IsString()
  readonly concept!: string;

  @IsOptional()
  @IsString()
  readonly description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  readonly amount!: number;

  @IsEnum(PaymentTypeEnum)
  readonly paymentType!: PaymentTypeEnum;

  @ValidateIf((o) => o.paymentType === PaymentTypeEnum.INSTALLMENT)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly installmentNumber?: number;

  @ValidateIf((o) => o.paymentType === PaymentTypeEnum.INSTALLMENT)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly installmentTotal?: number;

  @IsOptional()
  @IsBoolean()
  readonly addMpFee?: boolean;

  @IsDateString()
  readonly expiresAt!: string;
}
