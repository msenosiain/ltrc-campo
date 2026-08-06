import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

export class BulkMoveParticipantsTransportDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  readonly participantIds!: string[];

  /** ID del TripTransport destino. null/undefined = quitar asignación. */
  @IsOptional()
  @IsString()
  readonly transportId?: string | null;
}
