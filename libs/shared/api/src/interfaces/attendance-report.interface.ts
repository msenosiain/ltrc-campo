import { CategoryEnum, SportEnum } from '../enums';

export interface AttendanceReportTotals {
  total: number;
  present: number;
  absent: number;
  justified: number;
  pct: number;
}

export interface AttendanceReportSessionDetail {
  type: 'training' | 'match';
  id: string;
  date: string; // YYYY-MM-DD
  sport: SportEnum;
  category: CategoryEnum;
  status: 'present' | 'absent' | 'justified' | 'other_match';
  label?: string; // location (training) or opponent (match)
}

export interface AttendanceReportPlayerRow {
  playerId: string;
  playerName: string;
  sport: SportEnum;
  category: CategoryEnum;
  training: AttendanceReportTotals;
  match: AttendanceReportTotals;
  sessions: AttendanceReportSessionDetail[];
}

export interface AttendanceReportResponse {
  players: AttendanceReportPlayerRow[];
  meta: {
    sport?: SportEnum;
    category?: CategoryEnum;
    fromDate: string;
    toDate: string;
    type: 'training' | 'match' | 'both';
  };
}
