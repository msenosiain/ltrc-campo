import { Document, Types } from 'mongoose';
import { SportEnum } from '@ltrc-campo/shared-api-model';

export class PlayerSeasonRecordEntity extends Document {
  id: string;
  playerId: Types.ObjectId;
  season: string;
  sport: SportEnum;
  membershipCurrent: boolean;
  bduarRegistered: boolean;
  bduarRegistrationDate?: Date;
  coursesApproved: boolean;
  coursesDate?: Date;
  solidarityFundPaid: boolean;
  solidarityFundDate?: Date;
  notes?: string;
  updatedBy?: Types.ObjectId;
  updatedAt: Date;
}
