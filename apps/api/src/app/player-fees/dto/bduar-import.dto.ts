import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BduarRowDto {
  @IsString() @IsNotEmpty() documento!: string;
  @IsString() apellido!: string;
  @IsString() nombre!: string;
  @IsOptional() @IsString() fechaNac?: string;
  @IsOptional() @IsString() sexo?: string;
  @IsOptional() @IsString() puesto?: string;
  @IsOptional() @IsString() peso?: string;
  @IsOptional() @IsString() estatura?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() oSocial?: string;
  @IsOptional() @IsString() estado?: string;
}

export class BduarImportDto {
  @IsString() @IsNotEmpty() season!: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => BduarRowDto)
  rows!: BduarRowDto[];
}
