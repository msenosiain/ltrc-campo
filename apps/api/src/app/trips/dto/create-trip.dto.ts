import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CategoryEnum, SportEnum, TripStatusEnum } from '@ltrc-campo/shared-api-model';

export class CreateTripDto {
  @IsNotEmpty()
  @IsString()
  readonly name!: string;

  @IsNotEmpty()
  @IsString()
  readonly destination!: string;

  @IsOptional()
  @IsEnum(SportEnum)
  @Transform(({ value }) => value ?? undefined)
  readonly sport?: SportEnum;

  @IsOptional()
  @IsArray()
  @IsEnum(CategoryEnum, { each: true })
  readonly categories?: CategoryEnum[];

  @IsDateString()
  readonly departureDate!: string;

  @IsOptional()
  @IsDateString()
  readonly returnDate?: string;

  @IsOptional()
  @IsDateString()
  readonly registrationDeadline?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  readonly costPerPerson?: number;


  @IsOptional()
  @IsEnum(TripStatusEnum)
  readonly status?: TripStatusEnum;

  @IsOptional()
  @IsString()
  readonly linkedTournament?: string;

  @IsOptional()
  @IsString()
  readonly description?: string;
}
