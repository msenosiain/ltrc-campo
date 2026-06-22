import { Schema, Types } from 'mongoose';
import { CmjRecordEntity } from './cmj-record.entity';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export const CmjRecordSchema = new Schema<CmjRecordEntity>(
  {
    playerName: { type: String, required: true },
    playerId: { type: Types.ObjectId, ref: 'PlayerEntity' },
    sessionDate: { type: String, required: true },
    time: { type: String, required: true },
    sport: { type: String, enum: Object.values(SportEnum), required: true },
    category: { type: String, enum: Object.values(CategoryEnum), required: true },
    bodyWeightKg: { type: Number, default: null },
    reps: { type: Number, default: null },
    jumpHeightCm: { type: Number, default: null },
    eccentricDecelerationMeanPowerW: { type: Number, default: null },
    concentricImpulseNs: { type: Number, default: null },
    additionalLoadKg: { type: Number, default: null },
    measurementError: { type: Boolean, default: false },
    importedFromSessionId: { type: Types.ObjectId, ref: 'TrainingSessionEntity', required: true },
  },
  { timestamps: true, collection: 'cmj_records' }
);

CmjRecordSchema.index(
  { playerName: 1, sessionDate: 1, time: 1 },
  { unique: true }
);

CmjRecordSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

CmjRecordSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => { delete ret._id; },
});
