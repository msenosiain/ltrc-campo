import { IsOptional, IsString } from 'class-validator';

export class MoveParticipantLodgingDto {
  /** ID del TripLodging destino. null = quitar asignación. Si no se envía, no se modifica. */
  @IsOptional()
  @IsString()
  readonly lodgingId?: string | null;

  /** Número/nombre de habitación (solo aplica a hoteles). Si no se envía, no se modifica. */
  @IsOptional()
  @IsString()
  readonly roomNumber?: string | null;
}
