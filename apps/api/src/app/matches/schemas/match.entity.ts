import { Document, PopulatedDoc, Types } from 'mongoose';
import {
  AttendanceEntry,
  CategoryEnum,
  HockeyBranchEnum,
  MatchStatusEnum,
  SportEnum,
  VideoVisibility,
  VideoClip,
} from '@ltrc-campo/shared-api-model';
import { TournamentEntity } from '../../tournaments/schemas/tournament.entity';
import { PlayerEntity } from '../../players/schemas/player.entity';

export class MatchEntity extends Document {
  id: string;
  date: Date;
  time?: string;
  name?: string;
  opponent?: string;
  venue: string;
  isHome?: boolean;
  status: MatchStatusEnum;
  sport?: SportEnum;
  category: CategoryEnum;
  division?: string;
  branch?: HockeyBranchEnum;
  tournament?: PopulatedDoc<TournamentEntity & Document>;
  matchDay?: {
    referee?: string;
    ar1?: string;
    ar2?: string;
    headCoach?: string;
  };
  squad: {
    shirtNumber: number;
    dorsalNumber?: number;
    isCaptain?: boolean;
    posterLabel?: string;
    player: PopulatedDoc<PlayerEntity & Document>;
  }[];
  attendance: AttendanceEntry[];
  attachments: { fileId: string; filename: string; mimeType: string; name?: string; visibility?: VideoVisibility; targetPlayers?: Types.ObjectId[] }[];
  videos?: VideoClip[];
  result?: {
    homeScore: number;
    awayScore: number;
  };
  notes?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
