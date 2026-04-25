import { Schema, Types } from 'mongoose';
import { MatchEntity } from './match.entity';
import {
  CategoryEnum,
  HockeyBranchEnum,
  MatchStatusEnum,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import { PlayerEntity } from '../../players/schemas/player.entity';
import { TournamentEntity } from '../../tournaments/schemas/tournament.entity';
import { AttendanceEntrySchema } from '../../shared/schemas/attendance-entry.schema';

const MatchResultSchema = new Schema(
  {
    homeScore: { type: Number, required: true },
    awayScore: { type: Number, required: true },
  },
  { _id: false }
);

const MatchDayStaffSchema = new Schema(
  {
    referee: { type: String },
    ar1: { type: String },
    ar2: { type: String },
    headCoach: { type: String },
  },
  { _id: false }
);

const MatchSquadEntrySchema = new Schema(
  {
    shirtNumber: { type: Number, required: true, min: 1, max: 99 },
    dorsalNumber: { type: Number, min: 1, max: 99 },
    isCaptain: { type: Boolean },
    player: { type: Types.ObjectId, ref: PlayerEntity.name, required: true },
  },
  { _id: false }
);

const MatchVideoSchema = new Schema(
  {
    videoId: { type: String, required: true },
    url: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    visibility: { type: String, enum: ['all', 'staff', 'players'], required: true, default: 'all' },
    targetPlayers: [{ type: Types.ObjectId, ref: PlayerEntity.name }],
  },
  { _id: false }
);

export const MatchSchema = new Schema<MatchEntity>(
  {
    date: { type: Date, required: true },
    time: { type: String },
    name: { type: String },
    opponent: { type: String },
    venue: { type: String, required: true },
    isHome: { type: Boolean, default: true },
    status: {
      type: String,
      enum: Object.values(MatchStatusEnum),
      default: MatchStatusEnum.UPCOMING,
    },
    category: {
      type: String,
      enum: Object.values(CategoryEnum),
      required: true,
    },
    sport: { type: String, enum: Object.values(SportEnum) },
    division: { type: String },
    branch: { type: String, enum: [...Object.values(HockeyBranchEnum), null] },
    tournament: { type: Types.ObjectId, ref: TournamentEntity.name, required: false },
    matchDay: { type: MatchDayStaffSchema },
    squad: [MatchSquadEntrySchema],
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
    videos: [MatchVideoSchema],
    result: MatchResultSchema,
    notes: { type: String },
    createdBy: { type: Types.ObjectId, ref: 'User' },
    updatedBy: { type: Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'matches',
  }
);

MatchSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

MatchSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
  },
});
