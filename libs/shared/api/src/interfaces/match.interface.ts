import { Document } from 'mongoose';
import {
  CategoryEnum,
  HockeyBranchEnum,
  MatchStatusEnum,
  SportEnum,
} from '../enums';
import { AttendanceEntry } from './attendance-entry.interface';
import { Player } from './player.interface';
import { Tournament } from './tournament.interface';

export interface MatchResult {
  homeScore: number;
  awayScore: number;
}

export type VideoVisibility = 'all' | 'staff' | 'players';

export interface VideoClip {
  videoId?: string;
  url: string;
  name: string;
  description?: string;
  visibility: VideoVisibility;
  /** Solo relevante cuando visibility === 'players'. Staff siempre ve todos los videos. */
  targetPlayers?: Player[];
}

export interface MatchDayStaff {
  referee?: string;
  ar1?: string;
  ar2?: string;
  headCoach?: string;
}

export interface SquadEntry {
  shirtNumber: number;
  dorsalNumber?: number;
  isCaptain?: boolean;
  player: Player;
}

export interface MatchAttachment {
  fileId: string;
  filename: string;
  mimeType: string;
  name?: string;
  visibility?: VideoVisibility;
  /** Solo relevante cuando visibility === 'players'. Staff siempre ve todos los adjuntos. */
  targetPlayers?: string[];
}

export interface Match extends Document {
  readonly id?: string;
  readonly date: Date;
  readonly time?: string;
  readonly name?: string;
  readonly opponent?: string;
  readonly venue: string;
  readonly isHome?: boolean;
  readonly status: MatchStatusEnum;
  readonly sport?: SportEnum;
  readonly category: CategoryEnum;
  readonly division?: string;
  readonly branch?: HockeyBranchEnum;
  readonly tournament?: Tournament;
  readonly matchDay?: MatchDayStaff;
  readonly squad: SquadEntry[];
  readonly attendance: AttendanceEntry[];
  readonly attachments?: MatchAttachment[];
  readonly videos?: VideoClip[];
  readonly result?: MatchResult;
  readonly notes?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}
