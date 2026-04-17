import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { PaymentMethodEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export class RecordManualFeePaymentDto {
  @IsMongoId()
  playerId: string;

  @IsString()
  season: string;

  @IsEnum(SportEnum)
  sport: SportEnum;

  @IsEnum(PaymentMethodEnum)
  method: PaymentMethodEnum;

  @IsOptional()
  @IsString()
  notes?: string;
}
