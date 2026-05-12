import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PaymentEntityTypeEnum,
  PaymentMethodEnum,
} from '@ltrc-campo/shared-api-model';

export class RecordManualPaymentDto {
  @IsEnum(PaymentEntityTypeEnum)
  readonly entityType!: PaymentEntityTypeEnum;

  @IsString()
  readonly entityId!: string;

  @IsOptional()
  @IsString()
  readonly playerId?: string;

  @IsOptional()
  @IsString()
  readonly userId?: string;

  @IsOptional()
  @IsString()
  readonly payerName?: string;

  @IsOptional()
  @IsString()
  readonly payerDni?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  readonly amount!: number;

  @IsEnum(PaymentMethodEnum)
  readonly method!: PaymentMethodEnum;

  @IsString()
  readonly concept!: string;

  @IsDateString()
  readonly date!: string;

  @IsOptional()
  @IsString()
  readonly notes?: string;
}
