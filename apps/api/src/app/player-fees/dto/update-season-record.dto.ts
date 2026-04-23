import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { SportEnum } from '@ltrc-campo/shared-api-model';

export class UpdateSeasonRecordDto {
  @IsString() season!: string;
  @IsEnum(SportEnum) sport!: SportEnum;

  @IsOptional() @IsBoolean() membershipCurrent?: boolean;

  @IsOptional() @IsBoolean() bduarRegistered?: boolean;
  @IsOptional() @IsDateString() bduarRegistrationDate?: string;

  @IsOptional() @IsBoolean() coursesApproved?: boolean;
  @IsOptional() @IsDateString() coursesDate?: string;

  @IsOptional() @IsBoolean() solidarityFundPaid?: boolean;
  @IsOptional() @IsDateString() solidarityFundDate?: string;

  @IsOptional() @IsString() notes?: string;
}
