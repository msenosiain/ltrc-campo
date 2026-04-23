import { IsArray, IsString, ValidateNested, ArrayMinSize } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { toTitleCase } from '@ltrc-campo/shared-api-model';

export class FamilyGroupImportItemDto {
  @IsString() @Transform(({ value }) => toTitleCase(value)) name!: string;
  @IsArray() @IsString({ each: true }) @ArrayMinSize(2) dnis!: string[];
}

export class ImportFamilyGroupsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FamilyGroupImportItemDto)
  groups!: FamilyGroupImportItemDto[];
}
