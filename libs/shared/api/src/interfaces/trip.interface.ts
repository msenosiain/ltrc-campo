import { Document } from 'mongoose';
import {
  CategoryEnum,
  LodgingTypeEnum,
  SportEnum,
  TransportTypeEnum,
  TripParticipantStatusEnum,
  TripParticipantTypeEnum,
  TripStatusEnum,
} from '../enums';
import { Player } from './player.interface';
import { Tournament } from './tournament.interface';

export interface PaymentEntry {
  readonly id?: string;
  readonly amount: number;
  readonly date: Date;
  readonly method?: string;
  readonly notes?: string;
  readonly recordedBy?: string;
}

export interface TripTransport {
  readonly id?: string;
  readonly name: string;
  readonly type: TransportTypeEnum;
  readonly capacity: number;
  readonly company?: string;
  readonly departureTime?: string;
  readonly notes?: string;
}

export interface TripLodging {
  readonly id?: string;
  readonly type: LodgingTypeEnum;
  readonly name: string;
  readonly contactName?: string;
  readonly phone?: string;
  /** Segundo contacto (aplica a familias anfitrionas) */
  readonly contactName2?: string;
  readonly phone2?: string;
  readonly address?: string;
  readonly capacity: number;
  readonly notes?: string;
  /** Categoría del viaje a la que pertenece (aplica a familias anfitrionas) */
  readonly category?: CategoryEnum;
}

export interface TripParticipant {
  readonly id?: string;
  readonly type: TripParticipantTypeEnum;
  /** Poblado cuando type = PLAYER */
  readonly player?: Player;
  /** Referencia cuando type = STAFF (id del usuario) */
  readonly userId?: string;
  readonly userName?: string;
  /** Solo para type = EXTERNAL */
  readonly externalName?: string;
  readonly externalDni?: string;
  readonly externalRole?: string;
  /** Categoría a la que pertenece/acompaña en este viaje (opcional, staff o external) */
  readonly category?: CategoryEnum;
  readonly status: TripParticipantStatusEnum;
  readonly costAssigned: number;
  readonly payments: PaymentEntry[];
  readonly specialNeeds?: string;
  /** ID del TripTransport asignado */
  readonly transportId?: string;
  readonly seatNumber?: number;
  /** ID del TripLodging asignado */
  readonly lodgingId?: string;
  /** Solo aplica cuando el lodging es de tipo HOTEL */
  readonly roomNumber?: string;
  readonly documentationOk?: boolean;
  /** ID de otro TripParticipant al que acompaña (para EXTERNAL) */
  readonly accompanyingParticipantId?: string;
}

export interface Trip extends Document {
  readonly id?: string;
  readonly name: string;
  readonly destination: string;
  readonly sport?: SportEnum;
  readonly categories?: CategoryEnum[];
  readonly departureDate: Date;
  readonly returnDate?: Date;
  readonly registrationDeadline?: Date;
  readonly costPerPerson: number;
  readonly status: TripStatusEnum;
  readonly linkedTournament?: Tournament;
  readonly description?: string;
  readonly participants: TripParticipant[];
  readonly transports: TripTransport[];
  readonly lodgings: TripLodging[];
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface TripFilters {
  searchTerm?: string;
  sport?: SportEnum;
  status?: TripStatusEnum;
}
