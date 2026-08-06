import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

export class BulkMoveParticipantsLodgingDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  readonly participantIds!: string[];

  /** ID del TripLodging destino. null/undefined = quitar asignación. */
  @IsOptional()
  @IsString()
  readonly lodgingId?: string | null;
}
