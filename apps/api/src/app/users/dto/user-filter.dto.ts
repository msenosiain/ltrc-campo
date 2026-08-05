import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { CategoryEnum, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export class UserFiltersDto {
  @IsOptional()
  @IsString()
  searchTerm?: string;

  @IsOptional()
  @IsBoolean()
  excludePlayers?: boolean;

  @IsOptional()
  @IsEnum(RoleEnum)
  role?: RoleEnum;

  @IsOptional()
  @IsEnum(SportEnum)
  sport?: SportEnum;

  @IsOptional()
  @IsEnum(CategoryEnum)
  category?: CategoryEnum;

  @IsOptional()
  @IsArray()
  @IsEnum(CategoryEnum, { each: true })
  categories?: CategoryEnum[];
}
