import { Document, Types } from 'mongoose';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export class CmjRecordEntity extends Document {
  playerName: string;
  playerId?: Types.ObjectId;
  sessionDate: string;
  time: string;
  sport: SportEnum;
  category: CategoryEnum;
  bodyWeightKg: number | null;
  reps: number | null;
  jumpHeightCm: number | null;
  eccentricDecelerationMeanPowerW: number | null;
  concentricImpulseNs: number | null;
  additionalLoadKg: number | null;
  measurementError: boolean;
  importedFromSessionId: Types.ObjectId;
}
