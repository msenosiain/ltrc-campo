import { Document } from 'mongoose';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export class PlayerFeeConfigEntity extends Document {
  id: string;
  season: string;
  sport: SportEnum;
  feeType: string;
  label: string;
  description?: string;
  addMpFee: boolean;
  mpFeeRate: number;
  expiresAt: Date;
  active: boolean;
  linkToken: string;
  familyDiscount: boolean;
  blocks: { name: string; categories: CategoryEnum[]; amount: number }[];
  priceTiers?: { validUntil: Date; amountOverride: number }[];
  createdBy?: import('mongoose').Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
