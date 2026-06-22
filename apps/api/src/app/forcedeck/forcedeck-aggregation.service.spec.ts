import { ForcedeckAggregationService } from './forcedeck-aggregation.service';
import { CmjRecordEntity } from './schemas/cmj-record.entity';
import { CmrjRecordEntity } from './schemas/cmrj-record.entity';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { Types } from 'mongoose';

function makeCmj(
  playerName: string,
  sessionDate: string,
  jumpHeightCm: number | null,
  overrides: Partial<CmjRecordEntity> = {}
): CmjRecordEntity {
  return {
    playerName,
    sessionDate,
    time: '09:00:00',
    sport: SportEnum.RUGBY,
    category: CategoryEnum.PLANTEL_SUPERIOR,
    bodyWeightKg: 85,
    reps: 1,
    jumpHeightCm,
    eccentricDecelerationMeanPowerW: 1200,
    concentricImpulseNs: 200,
    additionalLoadKg: 0,
    measurementError: jumpHeightCm !== null && jumpHeightCm < 1,
    importedFromSessionId: new Types.ObjectId(),
    ...overrides,
  } as unknown as CmjRecordEntity;
}

function makeCmrj(
  playerName: string,
  sessionDate: string,
  reboundJumpHeightCm: number | null,
  overrides: Partial<CmrjRecordEntity> = {}
): CmrjRecordEntity {
  return {
    playerName,
    sessionDate,
    time: '09:00:00',
    sport: SportEnum.RUGBY,
    category: CategoryEnum.PLANTEL_SUPERIOR,
    bodyWeightKg: 85,
    reps: 1,
    firstJumpHeightCm: 40,
    reboundJumpHeightCm,
    reboundContactTimeMs: 250,
    activeStiffnessIndex: 2.0,
    measurementError: reboundJumpHeightCm !== null && reboundJumpHeightCm < 1,
    importedFromSessionId: new Types.ObjectId(),
    ...overrides,
  } as unknown as CmrjRecordEntity;
}

describe('ForcedeckAggregationService', () => {
  let service: ForcedeckAggregationService;

  beforeEach(() => {
    service = new ForcedeckAggregationService();
  });

  describe('aggregateCmj', () => {
    it('picks the best mark when a player has multiple attempts in the same session', () => {
      const records = [
        makeCmj('Juan Perez', '2026-06-01', 42, { time: '09:00:00' } as any),
        makeCmj('Juan Perez', '2026-06-01', 47, { time: '09:01:00' } as any),
        makeCmj('Juan Perez', '2026-06-01', 39, { time: '09:02:00' } as any),
      ];
      const result = service.aggregateCmj(records);
      expect(result.lastSession!.playerBests).toHaveLength(1);
      expect(result.lastSession!.playerBests[0].jumpHeightCm).toBe(47);
    });

    it('excludes outliers (jumpHeight < 1) from charts and rankings', () => {
      const records = [
        makeCmj('Juan Perez', '2026-06-01', 45),
        makeCmj('Pedro Lopez', '2026-06-01', 0.3),
      ];
      const result = service.aggregateCmj(records);
      expect(result.excludedOutliers).toBe(1);
      expect(result.totalPlayers).toBe(1);
      const playerNames = result.lastSession!.playerBests.map((p) => p.playerName);
      expect(playerNames).not.toContain('Pedro Lopez');
    });

    it('computes team average per session correctly', () => {
      const records = [
        makeCmj('A', '2026-06-01', 40),
        makeCmj('B', '2026-06-01', 50),
        makeCmj('C', '2026-06-01', 30),
      ];
      const result = service.aggregateCmj(records);
      expect(result.sessions[0].teamAvg).toBeCloseTo(40, 1);
    });

    it('sorts sessions chronologically', () => {
      const records = [
        makeCmj('A', '2026-07-01', 44),
        makeCmj('A', '2026-05-01', 42),
        makeCmj('A', '2026-06-01', 43),
      ];
      const result = service.aggregateCmj(records);
      const dates = result.sessions.map((s) => s.sessionDate);
      expect(dates).toEqual(['2026-05-01', '2026-06-01', '2026-07-01']);
    });

    it('tracks player history across multiple sessions', () => {
      const records = [
        makeCmj('Juan', '2026-05-01', 40),
        makeCmj('Juan', '2026-06-01', 44),
        makeCmj('Juan', '2026-07-01', 48),
      ];
      const result = service.aggregateCmj(records);
      const juan = result.playerHistories.find((p) => p.playerName === 'Juan');
      expect(juan).toBeDefined();
      expect(juan!.sessions).toHaveLength(3);
      expect(juan!.bestJumpHeightCm).toBe(48);
    });

    it('returns empty data gracefully when all records are outliers', () => {
      const records = [
        makeCmj('A', '2026-06-01', 0.1),
        makeCmj('B', '2026-06-01', 0.0),
      ];
      const result = service.aggregateCmj(records);
      expect(result.totalPlayers).toBe(0);
      expect(result.lastSession).toBeNull();
      expect(result.excludedOutliers).toBe(2);
    });

    it('identifies the best jump correctly across all sessions', () => {
      const records = [
        makeCmj('A', '2026-05-01', 40),
        makeCmj('B', '2026-05-01', 55),
        makeCmj('A', '2026-06-01', 48),
      ];
      const result = service.aggregateCmj(records);
      expect(result.bestJump?.playerName).toBe('B');
      expect(result.bestJump?.value).toBe(55);
    });
  });

  describe('aggregateCmrj', () => {
    it('picks the best rebound jump when a player has multiple attempts', () => {
      const records = [
        makeCmrj('Juan', '2026-06-01', 30, { time: '09:00:00' } as any),
        makeCmrj('Juan', '2026-06-01', 38, { time: '09:01:00' } as any),
        makeCmrj('Juan', '2026-06-01', 25, { time: '09:02:00' } as any),
      ];
      const result = service.aggregateCmrj(records);
      const validBests = result.lastSession!.playerBests.filter((p) => !p.measurementError);
      expect(validBests).toHaveLength(1);
      expect(validBests[0].reboundJumpHeightCm).toBe(38);
    });

    it('excludes outliers (rebound < 1 cm) from valid rankings', () => {
      const records = [
        makeCmrj('A', '2026-06-01', 35),
        makeCmrj('B', '2026-06-01', 0.5),
      ];
      const result = service.aggregateCmrj(records);
      expect(result.excludedOutliers).toBe(1);
      const validBests = result.lastSession!.playerBests.filter((p) => !p.measurementError);
      expect(validBests).toHaveLength(1);
    });

    it('keeps outliers in the session.playerBests array with measurementError=true', () => {
      const records = [
        makeCmrj('A', '2026-06-01', 35),
        makeCmrj('B', '2026-06-01', 0.3),
      ];
      const result = service.aggregateCmrj(records);
      const outlier = result.lastSession!.playerBests.find(
        (p) => p.playerName === 'B'
      );
      expect(outlier).toBeDefined();
      expect(outlier!.measurementError).toBe(true);
    });

    it('computes average rebound height from valid records only', () => {
      const records = [
        makeCmrj('A', '2026-06-01', 30),
        makeCmrj('B', '2026-06-01', 40),
        makeCmrj('C', '2026-06-01', 0.2),
      ];
      const result = service.aggregateCmrj(records);
      expect(result.avgReboundHeight).toBeCloseTo(35, 1);
    });
  });
});
