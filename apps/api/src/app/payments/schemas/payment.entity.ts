import { Document, Types } from 'mongoose';
import {
  PaymentEntityTypeEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
} from '@ltrc-campo/shared-api-model';

export class PaymentEntity extends Document {
  id: string;
  paymentLinkId?: Types.ObjectId;
  entityType: PaymentEntityTypeEnum;
  entityId: Types.ObjectId;
  playerId?: Types.ObjectId;
  userId?: Types.ObjectId;
  payerName?: string;
  payerDni?: string;
  amount: number;
  method: PaymentMethodEnum;
  status: PaymentStatusEnum;
  concept: string;
  mpPaymentId?: string;
  mpPreferenceId?: string;
  mpExternalReference?: string;
  mpStatusDetail?: string;
  date: Date;
  notes?: string;
  recordedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
