import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AddParticipantDto } from './add-participant.dto';

export class BulkAddParticipantsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddParticipantDto)
  readonly participants!: AddParticipantDto[];
}
