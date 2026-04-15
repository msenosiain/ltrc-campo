import { Document, Types } from 'mongoose';
import { SportEnum } from '@ltrc-campo/shared-api-model';

export class FamilyGroupEntity extends Document {
  id: string;
  name: string;
  sport: SportEnum;
  members: { playerId: Types.ObjectId; order: 1 | 2 | 3 }[];
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
