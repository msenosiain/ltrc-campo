import { Schema } from 'mongoose';
import { PlayerFeeConfigEntity } from './player-fee-config.entity';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';

const BlockSchema = new Schema(
  {
    name: { type: String, required: true },
    categories: [{ type: String, enum: Object.values(CategoryEnum) }],
    amount: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date },
  },
  { _id: false }
);

const PriceTierSchema = new Schema(
  {
    validUntil: { type: Date, required: true },
    amountOverride: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

export const PlayerFeeConfigSchema = new Schema<PlayerFeeConfigEntity>(
  {
    season: { type: String, required: true },
    sport: { type: String, enum: Object.values(SportEnum), required: true },
    feeType: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String },
    addMpFee: { type: Boolean, default: true },
    mpFeeRate: { type: Number, required: true, default: 0.0599 },
    expiresAt: { type: Date, required: true },
    active: { type: Boolean, default: false },
    linkToken: { type: String, required: true, unique: true, index: true },
    familyDiscount: { type: Boolean, default: false },
    blocks: [BlockSchema],
    priceTiers: [PriceTierSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'player_fee_configs' }
);

PlayerFeeConfigSchema.virtual('id').get(function () {
  return (this._id as import('mongoose').Types.ObjectId).toHexString();
});

PlayerFeeConfigSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => { delete ret._id; },
});
