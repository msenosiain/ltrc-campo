import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { SportEnum } from '@ltrc-campo/shared-api-model';

export class UpdateSeasonRecordDto {
  @IsString() season!: string;
  @IsEnum(SportEnum) sport!: SportEnum;

  @IsOptional() @IsBoolean() cuotaAlDia?: boolean;

  @IsOptional() @IsBoolean() fichajeBDUAR?: boolean;

  @IsOptional() @IsBoolean() cursosAprobados?: boolean;
  @IsOptional() @IsDateString() cursosFecha?: string;

  @IsOptional() @IsBoolean() fondoSolidarioPagado?: boolean;
  @IsOptional() @IsDateString() fondoSolidarioFecha?: string;

  @IsOptional() @IsString() notes?: string;
}
