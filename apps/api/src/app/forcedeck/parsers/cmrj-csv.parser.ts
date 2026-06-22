import { Types } from 'mongoose';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { CmrjRecordEntity } from '../schemas/cmrj-record.entity';
import {
  findCol,
  numCol,
  parseForceDecksCSV,
  parseForceDecksDate,
} from './forcedeck-csv.parser';

export interface ParsedCmrjRow
  extends Omit<CmrjRecordEntity, keyof Document | 'id' | '_id'> {
  playerName: string;
}

export function parseCmrjCSV(
  csvText: string,
  sport: SportEnum,
  category: CategoryEnum,
  sessionId: string
): ParsedCmrjRow[] {
  const rows = parseForceDecksCSV(csvText);
  const sessionOid = new Types.ObjectId(sessionId);

  return rows.map((row) => {
    const playerName = (
      findCol(row, 'Name', 'Athlete', 'Player') || 'Desconocido'
    ).trim();

    const rawDate = findCol(row, 'Date');
    const sessionDate = rawDate ? parseForceDecksDate(rawDate) : '';
    const time = findCol(row, 'Time') || '00:00:00';

    const firstJumpHeightCm = numCol(
      row,
      'First Jump Height (Imp-Mom)',
      'First Jump Height'
    );
    const reboundJumpHeightCm = numCol(
      row,
      'Rebound Jump Height (Imp-Mom)',
      'Rebound Jump Height'
    );
    const reboundContactTimeMs = numCol(
      row,
      'Rebound Contact Time',
      'Braking Phase Duration',
      'Contact Time'
    );
    const activeStiffnessIndex = numCol(
      row,
      'Rebound Active Stiffness Index',
      'Active Stiffness',
      'Stiffness Index'
    );
    const bodyWeightKg = numCol(
      row,
      'System Weight',
      'Body Weight',
      'BM [Kg]',
      'Weight'
    );
    const reps = numCol(row, 'Rep');

    const measurementError =
      reboundJumpHeightCm !== null && reboundJumpHeightCm < 1;

    return {
      playerName,
      sessionDate,
      time,
      sport,
      category,
      bodyWeightKg: bodyWeightKg ?? null,
      reps: reps !== null ? Math.round(reps) : null,
      firstJumpHeightCm: firstJumpHeightCm ?? null,
      reboundContactTimeMs: reboundContactTimeMs ?? null,
      reboundJumpHeightCm: reboundJumpHeightCm ?? null,
      activeStiffnessIndex: activeStiffnessIndex ?? null,
      measurementError,
      importedFromSessionId: sessionOid,
    } as ParsedCmrjRow;
  });
}
