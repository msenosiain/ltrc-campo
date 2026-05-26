import { Document } from 'mongoose';
import {
  CategoryEnum,
  SportEnum,
  TrainingSessionStatusEnum,
} from '../enums';
import { AttendanceEntry } from './attendance-entry.interface';
import { TrainingSchedule } from './training-schedule.interface';
import { VideoVisibility } from './match.interface';

export { AttendanceEntry };

export interface TrainingSessionAttachment {
  fileId: string;
  filename: string;
  mimeType: string;
  name?: string;
  visibility?: VideoVisibility;
  /** Solo relevante cuando visibility === 'players'. Staff siempre ve todos los adjuntos. */
  targetPlayers?: string[];
}

export interface TrainingSession extends Document {
  readonly id?: string;
  readonly schedule?: TrainingSchedule;
  readonly date: string;
  readonly startTime: string; // HH:mm
  readonly endTime: string; // HH:mm
  readonly sport: SportEnum;
  readonly category: CategoryEnum;
  readonly division?: string;
  readonly location?: string;
  readonly status: TrainingSessionStatusEnum;
  readonly attendance: AttendanceEntry[];
  readonly attachments?: TrainingSessionAttachment[];
  readonly notes?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface TrainingSessionFilters {
  sport?: SportEnum;
  category?: CategoryEnum;
  status?: TrainingSessionStatusEnum;
  fromDate?: string;
  toDate?: string;
  location?: string;
}

export interface UpcomingTraining {
  sessionId: string;
  date: string; // ISO date YYYY-MM-DD
  startTime: string;
  endTime: string;
  sport: SportEnum;
  category: CategoryEnum;
  division?: string;
  location?: string;
  status: string;
  confirmations: number;
  confirmed?: boolean; // whether current user confirmed
}
