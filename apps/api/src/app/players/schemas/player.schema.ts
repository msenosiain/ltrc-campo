import { Schema, Types } from 'mongoose';
import { PlayerEntity } from './player.entity';
import {
  BloodTypeEnum,
  CategoryEnum,
  ClothingSizesEnum,
  HockeyBranchEnum,
  HockeyPositions,
  PlayerAvailabilityEnum,
  PlayerStatusEnum,
  RugbyPositions,
  SportEnum,
} from '@ltrc-campo/shared-api-model';

const allPositionValues = [
  ...new Set([
    ...Object.values(RugbyPositions),
    ...Object.values(HockeyPositions),
  ]),
];

const AddressSchema = new Schema(
  {
    street: String,
    number: String,
    floorApartment: String,
    neighborhood: String,
    city: String,
    postalCode: String,
    phoneNumber: { type: String, required: true },
  },
  { _id: false }
);

const ClothingSizesSchema = new Schema(
  {
    jersey: { type: String, enum: Object.values(ClothingSizesEnum) },
    shorts: { type: String, enum: Object.values(ClothingSizesEnum) },
    sweater: { type: String, enum: Object.values(ClothingSizesEnum) },
    pants: { type: String, enum: Object.values(ClothingSizesEnum) },
  },
  { _id: false }
);

const MedicalDataSchema = new Schema(
  {
    height: Number,
    weight: Number,
    torgIndex: Number,
    healthInsurance: String,
    bloodType: { type: String, enum: Object.values(BloodTypeEnum) },
  },
  { _id: false }
);

const ParentContactSchema = new Schema(
  {
    name: { type: String, required: true },
    email: String,
    phone: String,
  },
  { _id: false }
);

export const PlayerSchema = new Schema<PlayerEntity>(
  {
    idNumber: { type: String, unique: true, index: true },
    name: { type: String, required: true },
    memberNumber: String,
    nickName: String,
    birthDate: Date,
    email: { type: String, index: true },
    address: AddressSchema,
    sport: {
      type: String,
      enum: Object.values(SportEnum),
    },
    category: {
      type: String,
      enum: Object.values(CategoryEnum),
    },
    branch: {
      type: String,
      enum: Object.values(HockeyBranchEnum),
    },
    positions: [
      {
        type: String,
        enum: allPositionValues,
      },
    ],
    clothingSizes: ClothingSizesSchema,
    medicalData: MedicalDataSchema,
    parentContacts: [ParentContactSchema],
    status: {
      type: String,
      enum: Object.values(PlayerStatusEnum),
      default: PlayerStatusEnum.ACTIVE,
    },
    trialStartDate: { type: Date, required: false },
    availability: {
      type: new Schema(
        {
          status: {
            type: String,
            enum: Object.values(PlayerAvailabilityEnum),
            default: PlayerAvailabilityEnum.AVAILABLE,
          },
          reason: String,
          since: Date,
          estimatedReturn: Date,
        },
        { _id: false }
      ),
    },
    photoId: { type: String },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      sparse: true,
    },
    inactivatedAt: { type: Date },
    createdBy: { type: Types.ObjectId, ref: 'User' },
    updatedBy: { type: Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'players',
  }
);

PlayerSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

PlayerSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
  },
});
