import {
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SportEnum } from '@ltrc-campo/shared-api-model';

class FamilyMemberDto {
  @IsString() @IsNotEmpty() playerId!: string;
  @IsIn([1, 2, 3]) order!: 1 | 2 | 3;
}

export class CreateFamilyGroupDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsEnum(SportEnum) sport!: SportEnum;

  @IsArray() @ValidateNested({ each: true }) @Type(() => FamilyMemberDto)
  members!: FamilyMemberDto[];
}
