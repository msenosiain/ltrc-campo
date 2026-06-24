import { IsArray, IsString } from 'class-validator';

export class BulkRemoveParticipantsDto {
  @IsArray()
  @IsString({ each: true })
  readonly participantIds!: string[];
}