import { Document, Types } from 'mongoose';
import {
  PaymentEntityTypeEnum,
  PaymentLinkStatusEnum,
  PaymentTypeEnum,
} from '@ltrc-campo/shared-api-model';

export class PaymentLinkEntity extends Document {
  id: string;
  linkToken: string;
  entityType: PaymentEntityTypeEnum;
  entityId: Types.ObjectId;
  entityIds?: Types.ObjectId[];
  concept: string;
  description?: string;
  amount: number;
  addMpFee: boolean;
  mpFeeRate: number;
  mpFeeAmount: number;
  netAmount: number;
  paymentType: PaymentTypeEnum;
  installmentNumber?: number;
  installmentTotal?: number;
  expiresAt: Date;
  status: PaymentLinkStatusEnum;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
