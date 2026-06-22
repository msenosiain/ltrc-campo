import { Types } from 'mongoose';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { CmjRecordEntity } from '../schemas/cmj-record.entity';
import {
  findCol,
  numCol,
  parseForceDecksCSV,
  parseForceDecksDate,
} from './forcedeck-csv.parser';

export interface ParsedCmjRow
  extends Omit<CmjRecordEntity, keyof Document | 'id' | '_id'> {
  playerName: string;
}

export function parseCmjCSV(
  csvText: string,
  sport: SportEnum,
  category: CategoryEnum,
  sessionId: string
): ParsedCmjRow[] {
  const rows = parseForceDecksCSV(csvText);
  const sessionOid = new Types.ObjectId(sessionId);

  return rows.map((row) => {
    const playerName = (
      findCol(row, 'Name', 'Athlete', 'Player') || 'Desconocido'
    ).trim();

    const rawDate = findCol(row, 'Date');
    const sessionDate = rawDate ? parseForceDecksDate(rawDate) : '';
    const time = findCol(row, 'Time') || '00:00:00';

    const jumpHeightCm = numCol(row, 'Jump Height (Imp-Mom)', 'Jump Height');
    const eccentricDecelerationMeanPowerW = numCol(
      row,
      'Eccentric Deceleration Mean Power',
      'Peak Power / BM',
      'Peak Power'
    );
    const concentricImpulseNs = numCol(row, 'Concentric Impulse');
    const bodyWeightKg = numCol(
      row,
      'System Weight',
      'Body Weight',
      'BM [Kg]',
      'Weight'
    );
    const additionalLoadKg = numCol(row, 'Additional Load');
    const reps = numCol(row, 'Rep');

    const measurementError =
      jumpHeightCm !== null && jumpHeightCm < 1;

    return {
      playerName,
      sessionDate,
      time,
      sport,
      category,
      bodyWeightKg: bodyWeightKg ?? null,
      reps: reps !== null ? Math.round(reps) : null,
      jumpHeightCm: measurementError ? jumpHeightCm : jumpHeightCm,
      eccentricDecelerationMeanPowerW: eccentricDecelerationMeanPowerW ?? null,
      concentricImpulseNs: concentricImpulseNs ?? null,
      additionalLoadKg: additionalLoadKg ?? null,
      measurementError,
      importedFromSessionId: sessionOid,
    } as ParsedCmjRow;
  });
}
