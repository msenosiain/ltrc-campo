import { Schema, Types } from 'mongoose';
import { CmrjRecordEntity } from './cmrj-record.entity';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export const CmrjRecordSchema = new Schema<CmrjRecordEntity>(
  {
    playerName: { type: String, required: true },
    playerId: { type: Types.ObjectId, ref: 'PlayerEntity' },
    sessionDate: { type: String, required: true },
    time: { type: String, required: true },
    sport: { type: String, enum: Object.values(SportEnum), required: true },
    category: { type: String, enum: Object.values(CategoryEnum), required: true },
    bodyWeightKg: { type: Number, default: null },
    reps: { type: Number, default: null },
    firstJumpHeightCm: { type: Number, default: null },
    reboundContactTimeMs: { type: Number, default: null },
    reboundJumpHeightCm: { type: Number, default: null },
    activeStiffnessIndex: { type: Number, default: null },
    measurementError: { type: Boolean, default: false },
    importedFromSessionId: { type: Types.ObjectId, ref: 'TrainingSessionEntity', required: true },
  },
  { timestamps: true, collection: 'cmrj_records' }
);

CmrjRecordSchema.index(
  { playerName: 1, sessionDate: 1, time: 1 },
  { unique: true }
);

CmrjRecordSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

CmrjRecordSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => { delete ret._id; },
});
