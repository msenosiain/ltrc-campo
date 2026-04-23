import { Document } from 'mongoose';
import {
  CategoryEnum,
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
  readonly status: TripParticipantStatusEnum;
  readonly costAssigned: number;
  readonly payments: PaymentEntry[];
  readonly specialNeeds?: string;
  /** ID del TripTransport asignado */
  readonly transportId?: string;
  readonly seatNumber?: number;
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
  readonly maxParticipants?: number;
  readonly status: TripStatusEnum;
  readonly linkedTournament?: Tournament;
  readonly description?: string;
  readonly participants: TripParticipant[];
  readonly transports: TripTransport[];
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface TripFilters {
  searchTerm?: string;
  sport?: SportEnum;
  status?: TripStatusEnum;
}
