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
import { CategoryEnum, LodgingTypeEnum } from '@ltrc-campo/shared-api-model';

export class AddLodgingDto {
  @IsNotEmpty()
  @IsString()
  readonly name!: string;

  @IsEnum(LodgingTypeEnum)
  readonly type!: LodgingTypeEnum;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  readonly capacity!: number;

  @ValidateIf((o) => o.type === LodgingTypeEnum.HOST_FAMILY)
  @IsNotEmpty({ message: 'El contacto es obligatorio para familias anfitrionas' })
  @IsString()
  readonly contactName?: string;

  @ValidateIf((o) => o.type === LodgingTypeEnum.HOST_FAMILY)
  @IsNotEmpty({ message: 'El teléfono es obligatorio para familias anfitrionas' })
  @IsString()
  readonly phone?: string;

  @IsOptional()
  @IsString()
  readonly contactName2?: string;

  @IsOptional()
  @IsString()
  readonly phone2?: string;

  @IsOptional()
  @IsString()
  readonly address?: string;

  @IsOptional()
  @IsString()
  readonly notes?: string;

  @IsOptional()
  @IsEnum(CategoryEnum)
  readonly category?: CategoryEnum;
}
