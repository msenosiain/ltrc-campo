import { Document, Types } from 'mongoose';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export class CmrjRecordEntity extends Document {
  playerName: string;
  playerId?: Types.ObjectId;
  sessionDate: string;
  time: string;
  sport: SportEnum;
  category: CategoryEnum;
  bodyWeightKg: number | null;
  reps: number | null;
  firstJumpHeightCm: number | null;
  reboundContactTimeMs: number | null;
  reboundJumpHeightCm: number | null;
  activeStiffnessIndex: number | null;
  measurementError: boolean;
  importedFromSessionId: Types.ObjectId;
}
