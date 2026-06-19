import { Document, Types } from 'mongoose';

export class MatchPollEntity extends Document {
  id: string;
  matchId: Types.ObjectId;
  token: string;
  slug: string;
  startsAt: Date;
  endsAt: Date;
  votes: {
    fingerprint: string;
    playerId: Types.ObjectId;
    votedAt: Date;
  }[];
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
