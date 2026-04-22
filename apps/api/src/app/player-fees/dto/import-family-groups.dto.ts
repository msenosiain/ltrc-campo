import { IsArray, IsString, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class FamilyGroupImportItemDto {
  @IsString() name!: string;
  @IsArray() @IsString({ each: true }) @ArrayMinSize(2) dnis!: string[];
}

export class ImportFamilyGroupsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FamilyGroupImportItemDto)
  groups!: FamilyGroupImportItemDto[];
}
