import { Schema, Types } from 'mongoose';
import { PlayerFeePaymentEntity } from './player-fee-payment.entity';
import { PlayerFeeStatusEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { PlayerEntity } from '../../players/schemas/player.entity';

export const PlayerFeePaymentSchema = new Schema<PlayerFeePaymentEntity>(
  {
    playerId: { type: Types.ObjectId, ref: PlayerEntity.name, required: true, index: true },
    configId: { type: Types.ObjectId, ref: 'PlayerFeeConfigEntity', required: false, index: true, sparse: true },
    paymentMethod: { type: String },
    season: { type: String, required: true },
    sport: { type: String, enum: Object.values(SportEnum), required: true },
    originalAmount: { type: Number, required: true },
    discountPct: { type: Number },
    discountReason: { type: String },
    finalAmount: { type: Number, required: true },
    mpFeeAdded: { type: Number },
    status: {
      type: String,
      enum: Object.values(PlayerFeeStatusEnum),
      default: PlayerFeeStatusEnum.PENDING,
    },
    mpPaymentId: { type: String, index: true, sparse: true },
    mpPreferenceId: { type: String },
    mpExternalReference: { type: String, index: true, sparse: true },
    mpStatusDetail: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: true, collection: 'player_fee_payments' }
);

PlayerFeePaymentSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

PlayerFeePaymentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => { delete ret._id; },
});
