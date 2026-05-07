import { Schema, Types } from 'mongoose';
import { PaymentLinkEntity } from './payment-link.entity';
import {
  PaymentEntityTypeEnum,
  PaymentLinkStatusEnum,
  PaymentTypeEnum,
} from '@ltrc-campo/shared-api-model';

export const PaymentLinkSchema = new Schema<PaymentLinkEntity>(
  {
    linkToken: { type: String, required: true, unique: true, index: true },
    entityType: {
      type: String,
      enum: Object.values(PaymentEntityTypeEnum),
      required: true,
    },
    entityId: { type: Types.ObjectId, required: true, index: true },
    entityIds: { type: [Types.ObjectId], default: undefined },
    concept: { type: String, required: true },
    description: { type: String },
    amount: { type: Number, required: true, min: 0.01 },
    addMpFee: { type: Boolean, default: false },
    mpFeeRate: { type: Number, required: true },
    mpFeeAmount: { type: Number, required: true },
    netAmount: { type: Number, required: true },
    paymentType: {
      type: String,
      enum: Object.values(PaymentTypeEnum),
      required: true,
    },
    installmentNumber: { type: Number },
    installmentTotal: { type: Number },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: Object.values(PaymentLinkStatusEnum),
      default: PaymentLinkStatusEnum.ACTIVE,
    },
    createdBy: { type: Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'payment_links' }
);

PaymentLinkSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

PaymentLinkSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
  },
});
