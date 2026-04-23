import { Schema, Types } from 'mongoose';
import { PaymentEntity } from './payment.entity';
import {
  PaymentEntityTypeEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
} from '@ltrc-campo/shared-api-model';
import { PlayerEntity } from '../../players/schemas/player.entity';
import { User } from '../../users/schemas/user.schema';

export const PaymentSchema = new Schema<PaymentEntity>(
  {
    paymentLinkId: { type: Types.ObjectId, ref: 'PaymentLinkEntity', index: true },
    entityType: {
      type: String,
      enum: Object.values(PaymentEntityTypeEnum),
      required: true,
    },
    entityId: { type: Types.ObjectId, required: true, index: true },
    playerId: { type: Types.ObjectId, ref: PlayerEntity.name, required: false },
    userId:   { type: Types.ObjectId, ref: User.name,         required: false },
    payerName: { type: String },
    payerDni:  { type: String },
    amount: { type: Number, required: true, min: 0.01 },
    method: {
      type: String,
      enum: Object.values(PaymentMethodEnum),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(PaymentStatusEnum),
      default: PaymentStatusEnum.PENDING,
    },
    concept: { type: String, required: true },
    mpPaymentId: { type: String, index: true, sparse: true },
    mpPreferenceId: { type: String },
    mpExternalReference: { type: String, index: true, sparse: true },
    mpStatusDetail: { type: String },
    date: { type: Date, required: true },
    notes: { type: String },
    recordedBy: { type: Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'payments' }
);

PaymentSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

PaymentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
  },
});
