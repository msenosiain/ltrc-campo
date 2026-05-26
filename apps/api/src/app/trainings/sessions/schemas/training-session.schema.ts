import { Schema, Types } from 'mongoose';
import { TrainingSessionEntity } from './training-session.entity';
import {
  CategoryEnum,
  SportEnum,
  TrainingSessionStatusEnum,
} from '@ltrc-campo/shared-api-model';
import { TrainingScheduleEntity } from '../../schedules/schemas/training-schedule.entity';
import { AttendanceEntrySchema } from '../../../shared/schemas/attendance-entry.schema';

export const TrainingSessionSchema = new Schema<TrainingSessionEntity>(
  {
    schedule: { type: Types.ObjectId, ref: TrainingScheduleEntity.name },
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    sport: { type: String, enum: Object.values(SportEnum), required: true },
    category: {
      type: String,
      enum: Object.values(CategoryEnum),
      required: true,
    },
    division: { type: String },
    location: { type: String },
    status: {
      type: String,
      enum: Object.values(TrainingSessionStatusEnum),
      default: TrainingSessionStatusEnum.SCHEDULED,
    },
    attendance: [AttendanceEntrySchema],
    attachments: [
      new Schema(
        {
          fileId: { type: String, required: true },
          filename: { type: String, required: true },
          mimeType: { type: String, required: true },
          name: { type: String },
          visibility: { type: String, enum: ['all', 'staff', 'players'], default: 'all' },
          targetPlayers: [{ type: Types.ObjectId, ref: 'PlayerEntity', default: [] }],
        },
        { _id: false }
      ),
    ],
    notes: { type: String },
    createdBy: { type: Types.ObjectId, ref: 'User' },
    updatedBy: { type: Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'training_sessions',
  }
);

TrainingSessionSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

TrainingSessionSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
  },
});
