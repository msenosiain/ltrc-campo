import { Document, Types } from 'mongoose';
import {
  CategoryEnum,
  SportEnum,
  TransportTypeEnum,
  TripParticipantStatusEnum,
  TripParticipantTypeEnum,
  TripStatusEnum,
} from '@ltrc-campo/shared-api-model';

export class PaymentEntryEntity {
  _id!: Types.ObjectId;
  amount!: number;
  date!: Date;
  method?: string;
  notes?: string;
  recordedBy?: Types.ObjectId;
  sourcePaymentId?: Types.ObjectId;
}

export class TripTransportEntity {
  _id!: Types.ObjectId;
  name!: string;
  type!: TransportTypeEnum;
  capacity!: number;
  company?: string;
  departureTime?: string;
  notes?: string;
}

export class TripParticipantEntity {
  _id!: Types.ObjectId;
  type!: TripParticipantTypeEnum;
  player?: Types.ObjectId;
  user?: Types.ObjectId;
  externalName?: string;
  externalDni?: string;
  externalRole?: string;
  status!: TripParticipantStatusEnum;
  costAssigned!: number;
  payments!: PaymentEntryEntity[];
  specialNeeds?: string;
  transportId?: Types.ObjectId;
  seatNumber?: number;
  documentationOk?: boolean;
  accompanyingParticipantId?: Types.ObjectId;
}

export class TripEntity extends Document {
  id!: string;
  name!: string;
  destination!: string;
  sport?: SportEnum;
  categories?: CategoryEnum[];
  departureDate!: Date;
  returnDate?: Date;
  registrationDeadline?: Date;
  costPerPerson!: number;
  status!: TripStatusEnum;
  linkedTournament?: Types.ObjectId;
  description?: string;
  participants!: TripParticipantEntity[];
  transports!: TripTransportEntity[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt!: Date;
  updatedAt!: Date;
}
