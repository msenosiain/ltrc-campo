import { Document, Types } from 'mongoose';
import { PlayerFeeStatusEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export class PlayerFeePaymentEntity extends Document {
  id: string;
  playerId: Types.ObjectId;
  configId: Types.ObjectId;
  season: string;
  sport: SportEnum;
  originalAmount: number;
  discountPct?: number;
  discountReason?: string;
  finalAmount: number;
  mpFeeAdded?: number;
  status: PlayerFeeStatusEnum;
  mpPaymentId?: string;
  mpPreferenceId?: string;
  mpExternalReference?: string;
  mpStatusDetail?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
