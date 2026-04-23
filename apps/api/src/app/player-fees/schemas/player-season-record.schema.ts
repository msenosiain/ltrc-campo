import { Schema, Types } from 'mongoose';
import { PlayerSeasonRecordEntity } from './player-season-record.entity';
import { SportEnum } from '@ltrc-campo/shared-api-model';
import { PlayerEntity } from '../../players/schemas/player.entity';

export const PlayerSeasonRecordSchema = new Schema<PlayerSeasonRecordEntity>(
  {
    playerId: { type: Types.ObjectId, ref: PlayerEntity.name, required: true, index: true },
    season: { type: String, required: true },
    sport: { type: String, enum: Object.values(SportEnum), required: true },
    membershipCurrent: { type: Boolean, default: false },
    bduarRegistered: { type: Boolean, default: false },
    bduarRegistrationDate: { type: Date },
    coursesApproved: { type: Boolean, default: false },
    coursesDate: { type: Date },
    solidarityFundPaid: { type: Boolean, default: false },
    solidarityFundDate: { type: Date },
    notes: { type: String },
    updatedBy: { type: Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'player_season_records' }
);

// Un jugador solo puede tener un record por season+sport
PlayerSeasonRecordSchema.index({ playerId: 1, season: 1, sport: 1 }, { unique: true });

PlayerSeasonRecordSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

PlayerSeasonRecordSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => { delete ret._id; },
});
