import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { CategoryEnum, HockeyBranchEnum, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  memberNumber?: string;

  @IsOptional()
  @IsString()
  idNumber?: string;

  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  googleId?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(RoleEnum, { each: true })
  roles?: RoleEnum[];

  @IsOptional()
  @IsArray()
  @IsEnum(SportEnum, { each: true })
  sports?: SportEnum[];

  @IsOptional()
  @IsArray()
  @IsEnum(CategoryEnum, { each: true })
  categories?: CategoryEnum[];

  @IsOptional()
  @IsArray()
  @IsEnum(HockeyBranchEnum, { each: true })
  branches?: HockeyBranchEnum[];
}
