import { Schema, Types } from 'mongoose';
import { InternalPollEntity } from './internal-poll.entity';

const AwardSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);

const VoterSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'UserEntity', required: true },
    name: { type: String, required: true },
    weight: { type: Number, required: true, enum: [1, 2], default: 1 },
  },
  { _id: false }
);

const InternalVoteSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'UserEntity', required: true },
    awardId: { type: String, required: true },
    playerId: { type: Types.ObjectId, ref: 'PlayerEntity', required: true },
    votedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

export const InternalPollSchema = new Schema<InternalPollEntity>(
  {
    matchId: { type: Types.ObjectId, ref: 'MatchEntity', required: true, index: true, unique: true },
    awards: { type: [AwardSchema], required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    voters: [VoterSchema],
    votes: [InternalVoteSchema],
    createdBy: { type: Types.ObjectId, ref: 'UserEntity' },
  },
  {
    timestamps: true,
    collection: 'internal_polls',
  }
);

InternalPollSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

InternalPollSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
  },
});
