import { Document } from 'mongoose';
import { CategoryEnum, MatchTypeEnum, SportEnum } from '../enums';

export interface TournamentAttachment {
  readonly id?: string;
  readonly fileId: string;
  readonly filename: string;
  readonly mimetype: string;
  readonly size: number;
  readonly uploadedAt: Date;
}

export interface Tournament extends Document {
  readonly id?: string;
  readonly name: string;
  readonly season?: string;
  readonly description?: string;
  readonly sport?: SportEnum;
  readonly categories?: CategoryEnum[];
  readonly type?: MatchTypeEnum;
  readonly logoFileId?: string;
  readonly attachments?: TournamentAttachment[];
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}
