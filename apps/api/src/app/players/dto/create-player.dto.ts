import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { Transform, Type, plainToInstance } from 'class-transformer';
import { parse as dateFnsParse } from 'date-fns';
import {
  CategoryEnum,
  ClothingSizesEnum,
  HockeyBranchEnum,
  HockeyPositions,
  parseDate,
  PlayerAvailabilityEnum,
  PlayerPosition,
  PlayerStatusEnum,
  RugbyPositions,
  SportEnum,
  toTitleCase,
  toLowerCase,
} from '@ltrc-campo/shared-api-model';

export class AddressDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTitleCase(value))
  street?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  floorApartment?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTitleCase(value))
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTitleCase(value))
  city?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsString()
  phoneNumber!: string;
}

export class ClothingSizesDto {
  @IsOptional()
  @IsEnum(ClothingSizesEnum)
  jersey?: ClothingSizesEnum;

  @IsOptional()
  @IsEnum(ClothingSizesEnum)
  shorts?: ClothingSizesEnum;

  @IsOptional()
  @IsEnum(ClothingSizesEnum)
  sweater?: ClothingSizesEnum;

  @IsOptional()
  @IsEnum(ClothingSizesEnum)
  pants?: ClothingSizesEnum;
}

export class MedicalDataDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  height?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  torgIndex?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  healthInsurance?: string;
}

export class ParentContactDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => toTitleCase(value))
  name!: string;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => toLowerCase(value))
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class PlayerAvailabilityDto {
  @IsEnum(PlayerAvailabilityEnum)
  status!: PlayerAvailabilityEnum;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    // Accept dd/MM/yyyy or ISO formats
    const ddMM = dateFnsParse(value, 'dd/MM/yyyy', new Date());
    return isNaN(ddMM.getTime()) ? new Date(value) : ddMM;
  })
  @IsDate()
  since?: Date;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    const ddMM = dateFnsParse(value, 'dd/MM/yyyy', new Date());
    return isNaN(ddMM.getTime()) ? new Date(value) : ddMM;
  })
  @IsDate()
  estimatedReturn?: Date;
}

export class CreatePlayerDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => toTitleCase(value))
  readonly name!: string;

  @IsOptional()
  @IsNumberString()
  readonly memberNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => toTitleCase(value))
  readonly nickName?: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value
  )
  readonly idNumber!: string;

  @IsNotEmpty()
  @Transform(({ value }) => parseDate(value))
  @IsDate({ message: '$property must be a valid date (dd/MM/yyyy)' })
  readonly birthDate!: Date;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => toLowerCase(value))
  readonly email?: string;

  @IsNotEmpty()
  @IsEnum(SportEnum)
  readonly sport!: SportEnum;

  @IsNotEmpty()
  @IsEnum(CategoryEnum)
  readonly category!: CategoryEnum;

  @IsOptional()
  @IsEnum(HockeyBranchEnum)
  readonly branch?: HockeyBranchEnum;

  @IsOptional()
  @IsIn(
    [
      ...new Set([
        ...Object.values(RugbyPositions),
        ...Object.values(HockeyPositions),
      ]),
    ],
    { each: true }
  )
  @Transform(({ value }) => {
    if (!value) return value;
    const arr = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(arr) ? arr : [arr];
  })
  readonly positions?: PlayerPosition[];

  @IsOptional()
  @Transform(({ value }) => {
    const obj = typeof value === 'string' ? JSON.parse(value) : value;
    return plainToInstance(AddressDto, obj);
  })
  @ValidateNested()
  readonly address?: AddressDto;

  @IsOptional()
  @Transform(({ value }) => {
    const obj = typeof value === 'string' ? JSON.parse(value) : value;
    return plainToInstance(ClothingSizesDto, obj);
  })
  @ValidateNested()
  readonly clothingSizes?: ClothingSizesDto;

  @IsOptional()
  @Transform(({ value }) => {
    const obj = typeof value === 'string' ? JSON.parse(value) : value;
    return plainToInstance(MedicalDataDto, obj);
  })
  @ValidateNested()
  readonly medicalData?: MedicalDataDto;

  @IsOptional()
  @Transform(({ value }) => {
    const arr = typeof value === 'string' ? JSON.parse(value) : value;
    // Support legacy single-object format
    const items = Array.isArray(arr) ? arr : [arr];
    return items.map((item: any) => plainToInstance(ParentContactDto, item));
  })
  @ValidateNested({ each: true })
  @Type(() => ParentContactDto)
  readonly parentContacts?: ParentContactDto[];

  @IsOptional()
  @IsEnum(PlayerStatusEnum)
  readonly status?: PlayerStatusEnum;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  })
  readonly trialStartDate?: Date;

  @IsOptional()
  @Transform(({ value }) => {
    const obj = typeof value === 'string' ? JSON.parse(value) : value;
    return plainToInstance(PlayerAvailabilityDto, obj);
  })
  @ValidateNested()
  readonly availability?: PlayerAvailabilityDto;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  readonly createUser?: boolean;
}
