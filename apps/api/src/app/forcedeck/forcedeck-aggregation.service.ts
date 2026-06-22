import { Injectable } from '@nestjs/common';
import { CmjRecordEntity } from './schemas/cmj-record.entity';
import { CmrjRecordEntity } from './schemas/cmrj-record.entity';

export interface CmjPlayerBest {
  playerName: string;
  playerId: string | null;
  jumpHeightCm: number;
  eccentricPowerW: number | null;
  concentricImpulseNs: number | null;
  bodyWeightKg: number | null;
}

export interface CmjSessionData {
  sessionDate: string;
  playerBests: CmjPlayerBest[];
  teamAvg: number;
  playerCount: number;
}

export interface CmjPlayerHistory {
  playerName: string;
  playerId: string | null;
  sessions: { sessionDate: string; jumpHeightCm: number; eccentricPowerW: number | null }[];
  bestJumpHeightCm: number;
  avgJumpHeightCm: number;
}

export interface CmjReportData {
  sessions: CmjSessionData[];
  playerHistories: CmjPlayerHistory[];
  lastSession: CmjSessionData | null;
  totalRecords: number;
  totalPlayers: number;
  excludedOutliers: number;
  avgJumpHeight: number;
  avgEccentricPower: number | null;
  avgConcentricImpulse: number | null;
  bestJump: { playerName: string; value: number } | null;
}

export interface CmrjPlayerBest {
  playerName: string;
  playerId: string | null;
  firstJumpHeightCm: number | null;
  reboundJumpHeightCm: number;
  reboundContactTimeMs: number | null;
  activeStiffnessIndex: number | null;
  bodyWeightKg: number | null;
  measurementError: boolean;
}

export interface CmrjSessionData {
  sessionDate: string;
  playerBests: CmrjPlayerBest[];
  teamAvgRebound: number;
  playerCount: number;
}

export interface CmrjReportData {
  sessions: CmrjSessionData[];
  lastSession: CmrjSessionData | null;
  totalRecords: number;
  totalPlayers: number;
  excludedOutliers: number;
  avgReboundHeight: number;
  avgContactTime: number | null;
  avgStiffness: number | null;
  bestRebound: { playerName: string; value: number } | null;
}

@Injectable()
export class ForcedeckAggregationService {
  aggregateCmj(records: CmjRecordEntity[]): CmjReportData {
    const outliers = records.filter((r) => r.measurementError);
    const valid = records.filter((r) => !r.measurementError && r.jumpHeightCm !== null);

    // Group by sessionDate + playerName → take best jumpHeight
    const sessionPlayerMap = new Map<string, Map<string, CmjRecordEntity[]>>();
    for (const r of valid) {
      if (!sessionPlayerMap.has(r.sessionDate)) {
        sessionPlayerMap.set(r.sessionDate, new Map());
      }
      const playerMap = sessionPlayerMap.get(r.sessionDate)!;
      if (!playerMap.has(r.playerName)) {
        playerMap.set(r.playerName, []);
      }
      playerMap.get(r.playerName)!.push(r);
    }

    const sessions: CmjSessionData[] = [];
    for (const [sessionDate, playerMap] of sessionPlayerMap) {
      const playerBests: CmjPlayerBest[] = [];
      for (const [playerName, attempts] of playerMap) {
        const best = attempts.reduce((a, b) =>
          (b.jumpHeightCm ?? 0) > (a.jumpHeightCm ?? 0) ? b : a
        );
        playerBests.push({
          playerName,
          playerId: best.playerId?.toHexString() ?? null,
          jumpHeightCm: best.jumpHeightCm!,
          eccentricPowerW: best.eccentricDecelerationMeanPowerW,
          concentricImpulseNs: best.concentricImpulseNs,
          bodyWeightKg: best.bodyWeightKg,
        });
      }
      playerBests.sort((a, b) => b.jumpHeightCm - a.jumpHeightCm);
      const teamAvg =
        playerBests.reduce((s, p) => s + p.jumpHeightCm, 0) /
        (playerBests.length || 1);
      sessions.push({
        sessionDate,
        playerBests,
        teamAvg,
        playerCount: playerBests.length,
      });
    }
    sessions.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

    // Per-player history across sessions
    const playerHistoryMap = new Map<string, CmjPlayerHistory>();
    for (const session of sessions) {
      for (const pb of session.playerBests) {
        if (!playerHistoryMap.has(pb.playerName)) {
          playerHistoryMap.set(pb.playerName, {
            playerName: pb.playerName,
            playerId: pb.playerId,
            sessions: [],
            bestJumpHeightCm: 0,
            avgJumpHeightCm: 0,
          });
        }
        playerHistoryMap.get(pb.playerName)!.sessions.push({
          sessionDate: session.sessionDate,
          jumpHeightCm: pb.jumpHeightCm,
          eccentricPowerW: pb.eccentricPowerW,
        });
      }
    }
    const playerHistories: CmjPlayerHistory[] = [];
    for (const hist of playerHistoryMap.values()) {
      const heights = hist.sessions.map((s) => s.jumpHeightCm);
      hist.bestJumpHeightCm = Math.max(...heights);
      hist.avgJumpHeightCm = heights.reduce((a, b) => a + b, 0) / heights.length;
      playerHistories.push(hist);
    }
    playerHistories.sort((a, b) => b.avgJumpHeightCm - a.avgJumpHeightCm);

    // Summary metrics (all valid records, best per player)
    const allBests = playerHistories;
    const avgJumpHeight =
      allBests.reduce((s, p) => s + p.avgJumpHeightCm, 0) / (allBests.length || 1);

    const validPower = sessions
      .flatMap((s) => s.playerBests)
      .filter((p) => p.eccentricPowerW !== null)
      .map((p) => p.eccentricPowerW!);
    const avgEccentricPower =
      validPower.length > 0
        ? validPower.reduce((a, b) => a + b, 0) / validPower.length
        : null;

    const validImpulse = sessions
      .flatMap((s) => s.playerBests)
      .filter((p) => p.concentricImpulseNs !== null)
      .map((p) => p.concentricImpulseNs!);
    const avgConcentricImpulse =
      validImpulse.length > 0
        ? validImpulse.reduce((a, b) => a + b, 0) / validImpulse.length
        : null;

    const bestEntry = allBests.reduce<CmjPlayerHistory | null>(
      (best, p) => (!best || p.bestJumpHeightCm > best.bestJumpHeightCm ? p : best),
      null
    );

    return {
      sessions,
      playerHistories,
      lastSession: sessions[sessions.length - 1] ?? null,
      totalRecords: valid.length,
      totalPlayers: playerHistories.length,
      excludedOutliers: outliers.length,
      avgJumpHeight,
      avgEccentricPower,
      avgConcentricImpulse,
      bestJump: bestEntry
        ? { playerName: bestEntry.playerName, value: bestEntry.bestJumpHeightCm }
        : null,
    };
  }

  aggregateCmrj(records: CmrjRecordEntity[]): CmrjReportData {
    const outliers = records.filter((r) => r.measurementError);
    const valid = records.filter(
      (r) => !r.measurementError && r.reboundJumpHeightCm !== null
    );

    const sessionPlayerMap = new Map<string, Map<string, CmrjRecordEntity[]>>();
    for (const r of valid) {
      if (!sessionPlayerMap.has(r.sessionDate)) {
        sessionPlayerMap.set(r.sessionDate, new Map());
      }
      const playerMap = sessionPlayerMap.get(r.sessionDate)!;
      if (!playerMap.has(r.playerName)) {
        playerMap.set(r.playerName, []);
      }
      playerMap.get(r.playerName)!.push(r);
    }

    const sessions: CmrjSessionData[] = [];
    for (const [sessionDate, playerMap] of sessionPlayerMap) {
      const playerBests: CmrjPlayerBest[] = [];
      for (const [playerName, attempts] of playerMap) {
        const best = attempts.reduce((a, b) =>
          (b.reboundJumpHeightCm ?? 0) > (a.reboundJumpHeightCm ?? 0) ? b : a
        );
        playerBests.push({
          playerName,
          playerId: best.playerId?.toHexString() ?? null,
          firstJumpHeightCm: best.firstJumpHeightCm,
          reboundJumpHeightCm: best.reboundJumpHeightCm!,
          reboundContactTimeMs: best.reboundContactTimeMs,
          activeStiffnessIndex: best.activeStiffnessIndex,
          bodyWeightKg: best.bodyWeightKg,
          measurementError: false,
        });
      }
      playerBests.sort((a, b) => b.reboundJumpHeightCm - a.reboundJumpHeightCm);

      // Add excluded outliers for this session (for history table)
      const sessionOutliers = records.filter(
        (r) => r.measurementError && r.sessionDate === sessionDate
      );
      for (const o of sessionOutliers) {
        playerBests.push({
          playerName: o.playerName,
          playerId: o.playerId?.toHexString() ?? null,
          firstJumpHeightCm: o.firstJumpHeightCm,
          reboundJumpHeightCm: o.reboundJumpHeightCm ?? 0,
          reboundContactTimeMs: o.reboundContactTimeMs,
          activeStiffnessIndex: o.activeStiffnessIndex,
          bodyWeightKg: o.bodyWeightKg,
          measurementError: true,
        });
      }

      const validBests = playerBests.filter((p) => !p.measurementError);
      const teamAvgRebound =
        validBests.reduce((s, p) => s + p.reboundJumpHeightCm, 0) /
        (validBests.length || 1);

      sessions.push({
        sessionDate,
        playerBests,
        teamAvgRebound,
        playerCount: validBests.length,
      });
    }
    sessions.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

    const allValidBests = sessions
      .flatMap((s) => s.playerBests)
      .filter((p) => !p.measurementError);

    const uniquePlayerNames = new Set(allValidBests.map((p) => p.playerName));

    const avgReboundHeight =
      allValidBests.reduce((s, p) => s + p.reboundJumpHeightCm, 0) /
      (allValidBests.length || 1);

    const validContact = allValidBests
      .filter((p) => p.reboundContactTimeMs !== null)
      .map((p) => p.reboundContactTimeMs!);
    const avgContactTime =
      validContact.length > 0
        ? validContact.reduce((a, b) => a + b, 0) / validContact.length
        : null;

    const validStiffness = allValidBests
      .filter((p) => p.activeStiffnessIndex !== null)
      .map((p) => p.activeStiffnessIndex!);
    const avgStiffness =
      validStiffness.length > 0
        ? validStiffness.reduce((a, b) => a + b, 0) / validStiffness.length
        : null;

    const bestEntry = allValidBests.reduce<CmrjPlayerBest | null>(
      (best, p) =>
        !best || p.reboundJumpHeightCm > best.reboundJumpHeightCm ? p : best,
      null
    );

    return {
      sessions,
      lastSession: sessions[sessions.length - 1] ?? null,
      totalRecords: valid.length,
      totalPlayers: uniquePlayerNames.size,
      excludedOutliers: outliers.length,
      avgReboundHeight,
      avgContactTime,
      avgStiffness,
      bestRebound: bestEntry
        ? { playerName: bestEntry.playerName, value: bestEntry.reboundJumpHeightCm }
        : null,
    };
  }
}
