import { Schema, Types } from 'mongoose';
import { MatchPollEntity } from './match-poll.entity';
import { PlayerEntity } from '../../players/schemas/player.entity';

const PollVoteSchema = new Schema(
  {
    fingerprint: { type: String, required: true },
    playerId: { type: Types.ObjectId, ref: PlayerEntity.name, required: true },
    votedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

export const MatchPollSchema = new Schema<MatchPollEntity>(
  {
    matchId: { type: Types.ObjectId, ref: 'MatchEntity', required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    slug: { type: String, unique: true, sparse: true, index: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    votes: [PollVoteSchema],
    createdBy: { type: Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'match_polls',
  }
);

MatchPollSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

MatchPollSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
  },
});
