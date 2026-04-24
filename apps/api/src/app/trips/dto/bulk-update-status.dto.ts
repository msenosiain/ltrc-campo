import { IsArray, IsEnum, IsString } from 'class-validator';
import { TripParticipantStatusEnum } from '@ltrc-campo/shared-api-model';

export class BulkUpdateStatusDto {
  @IsArray()
  @IsString({ each: true })
  readonly participantIds!: string[];

  @IsEnum(TripParticipantStatusEnum)
  readonly status!: TripParticipantStatusEnum;
}
