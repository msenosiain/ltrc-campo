import { Schema, Types } from 'mongoose';
import { TripEntity } from './trip.entity';
import {
  CategoryEnum,
  SportEnum,
  TransportTypeEnum,
  TripParticipantStatusEnum,
  TripParticipantTypeEnum,
  TripStatusEnum,
} from '@ltrc-campo/shared-api-model';

const withVirtualId = (schema: Schema) => {
  schema.virtual('id').get(function () {
    return (this._id as Types.ObjectId).toHexString();
  });
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_, ret) => {
      delete ret._id;
    },
  });
};

const PaymentEntrySchema = new Schema(
  {
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    method: { type: String },
    notes: { type: String },
    recordedBy: { type: Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);
withVirtualId(PaymentEntrySchema);

const TripTransportSchema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: Object.values(TransportTypeEnum), required: true },
    capacity: { type: Number, required: true },
    company: { type: String },
    departureTime: { type: String },
    notes: { type: String },
  },
  { _id: true }
);
withVirtualId(TripTransportSchema);

const TripParticipantSchema = new Schema(
  {
    type: { type: String, enum: Object.values(TripParticipantTypeEnum), required: true },
    player: { type: Types.ObjectId, ref: 'PlayerEntity' },
    user: { type: Types.ObjectId, ref: 'User' },
    externalName: { type: String },
    externalDni: { type: String },
    externalRole: { type: String },
    status: {
      type: String,
      enum: Object.values(TripParticipantStatusEnum),
      default: TripParticipantStatusEnum.INTERESTED,
    },
    costAssigned: { type: Number, required: true, default: 0 },
    payments: { type: [PaymentEntrySchema], default: [] },
    specialNeeds: { type: String },
    transportId: { type: Types.ObjectId },
    seatNumber: { type: Number },
    documentationOk: { type: Boolean, default: false },
    accompanyingParticipantId: { type: Types.ObjectId },
  },
  { _id: true }
);
withVirtualId(TripParticipantSchema);

export const TripSchema = new Schema<TripEntity>(
  {
    name: { type: String, required: true },
    destination: { type: String, required: true },
    sport: { type: String, enum: Object.values(SportEnum) },
    categories: [{ type: String, enum: Object.values(CategoryEnum) }],
    departureDate: { type: Date, required: true },
    returnDate: { type: Date },
    registrationDeadline: { type: Date },
    costPerPerson: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      enum: Object.values(TripStatusEnum),
      default: TripStatusEnum.DRAFT,
    },
    linkedTournament: { type: Types.ObjectId, ref: 'TournamentEntity' },
    description: { type: String },
    participants: { type: [TripParticipantSchema], default: [] },
    transports: { type: [TripTransportSchema], default: [] },
    createdBy: { type: Types.ObjectId, ref: 'User' },
    updatedBy: { type: Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'trips' }
);

withVirtualId(TripSchema);
