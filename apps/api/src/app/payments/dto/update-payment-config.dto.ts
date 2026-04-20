import { IsArray, IsString } from 'class-validator';

export class UpdatePaymentConfigDto {
  @IsArray()
  @IsString({ each: true })
  excludedPaymentTypes!: string[];
}
