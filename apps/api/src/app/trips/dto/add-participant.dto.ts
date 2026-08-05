import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CategoryEnum,
  TripParticipantStatusEnum,
  TripParticipantTypeEnum,
} from '@ltrc-campo/shared-api-model';

export class AddParticipantDto {
  @IsEnum(TripParticipantTypeEnum)
  readonly type!: TripParticipantTypeEnum;

  /** Requerido cuando type = PLAYER */
  @ValidateIf((o) => o.type === TripParticipantTypeEnum.PLAYER)
  @IsNotEmpty()
  @IsString()
  readonly playerId?: string;

  /** Requerido cuando type = STAFF */
  @ValidateIf((o) => o.type === TripParticipantTypeEnum.STAFF)
  @IsNotEmpty()
  @IsString()
  readonly userId?: string;

  /** Requerido cuando type = EXTERNAL */
  @ValidateIf((o) => o.type === TripParticipantTypeEnum.EXTERNAL)
  @IsNotEmpty()
  @IsString()
  readonly externalName?: string;

  @IsOptional()
  @IsString()
  readonly externalDni?: string;

  @IsOptional()
  @IsString()
  readonly externalRole?: string;

  /** Solo aplica cuando type = STAFF o EXTERNAL; categoría a la que acompaña/pertenece en este viaje */
  @IsOptional()
  @IsEnum(CategoryEnum)
  readonly category?: CategoryEnum;

  @IsOptional()
  @IsEnum(TripParticipantStatusEnum)
  readonly status?: TripParticipantStatusEnum;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  readonly costAssigned?: number;

  @IsOptional()
  @IsString()
  readonly specialNeeds?: string;

  @IsOptional()
  @IsString()
  readonly accompanyingParticipantId?: string;
}
