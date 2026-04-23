import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RecordPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  readonly amount!: number;

  @IsDateString()
  readonly date!: string;

  @IsOptional()
  @IsString()
  readonly method?: string;

  @IsOptional()
  @IsString()
  readonly notes?: string;
}
