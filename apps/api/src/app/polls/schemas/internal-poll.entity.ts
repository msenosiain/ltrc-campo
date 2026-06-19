import { Document, Types } from 'mongoose';

export class InternalPollEntity extends Document {
  id: string;
  matchId: Types.ObjectId;
  awards: {
    id: string;
    name: string;
  }[];
  startsAt: Date;
  endsAt: Date;
  voters: {
    userId: Types.ObjectId;
    name: string;
    weight: 1 | 2;
  }[];
  votes: {
    userId: Types.ObjectId;
    awardId: string;
    playerId: Types.ObjectId;
    votedAt: Date;
  }[];
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
