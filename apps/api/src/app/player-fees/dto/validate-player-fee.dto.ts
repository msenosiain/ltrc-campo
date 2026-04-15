import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ValidatePlayerFeeDto {
  @IsString() @IsNotEmpty() dni!: string;
}

export class ConfirmPlayerFeeDto {
  @IsString() @IsNotEmpty() externalReference!: string;
  @IsOptional() @IsString() paymentId?: string;
  @IsOptional() @IsString() status?: string;
}
