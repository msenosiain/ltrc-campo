import { Document, Types } from 'mongoose';
import { CategoryEnum, MatchTypeEnum, SportEnum, TournamentAttachment } from '@ltrc-campo/shared-api-model';

export class TournamentEntity extends Document {
  id: string;
  name: string;
  season?: string;
  description?: string;
  sport?: SportEnum;
  categories?: CategoryEnum[];
  type?: MatchTypeEnum;
  logoFileId?: string;
  attachments: TournamentAttachment[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
