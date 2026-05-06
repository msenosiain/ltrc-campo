import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_CONFIG_TOKEN, ApiConfig } from '../../app.config';
import { CategoryEnum, IFamilyGroup, IPlayerFeeConfig, IPlayerFeeStatusRow, IPlayerSeasonRecord, SportEnum } from '@ltrc-campo/shared-api-model';

export interface PlayerFeeStats {
  total: number;
  paid: number;
  eligible: number;
  byCategory: Record<string, { total: number; paid: number; eligible: number }>;
}

export interface UpdateSeasonRecordPayload {
  season: string;
  sport: SportEnum;
  membershipCurrent?: boolean;
  bduarRegistered?: boolean;
  coursesApproved?: boolean;
  solidarityFundPaid?: boolean;
  notes?: string;
}

export interface PlayerFeeConfigPayload {
  season: string;
  sport: SportEnum;
  feeType: string;
  label: string;
  description?: string;
  addMpFee: boolean;
  familyDiscount: boolean;
  blocks: { name: string; categories: CategoryEnum[]; amount: number; expiresAt?: string }[];
}

export interface BduarRow {
  documento: string;
  apellido: string;
  nombre: string;
  fechaNac?: string;
  sexo?: string;
  puesto?: string;
  peso?: string;
  estatura?: string;
  email?: string;
  oSocial?: string;
  grupoSanguineo?: string;
  fechaFichaje?: string;
  estado?: string;
}

export interface FamilyGroupPayload {
  name: string;
  sport: SportEnum;
  members: { playerId: string; order: number }[];
}

@Injectable({ providedIn: 'root' })
export class PlayerFeesAdminService {
  private readonly http = inject(HttpClient);
  private readonly config = inject<ApiConfig>(API_CONFIG_TOKEN);

  private url(path: string) {
    return `${this.config.baseUrl}/player-fees/${path}`;
  }

  // ── Status / Stats ────────────────────────────────────────────────────────

  getPlayerStatus(playerId: string, season: string) {
    return this.http.get<IPlayerFeeStatusRow[]>(this.url(`player-status/${playerId}`), { params: { season } });
  }

  getStatus(params: { season: string; sport: SportEnum; category?: CategoryEnum; categories?: CategoryEnum[] }) {
    const p: Record<string, string | string[]> = { season: params.season, sport: params.sport };
    if (params.categories?.length) p['categories'] = params.categories;
    else if (params.category) p['category'] = params.category;
    return this.http.get<IPlayerFeeStatusRow[]>(this.url('status'), { params: p });
  }

  getStats(season: string, sport: SportEnum) {
    return this.http.get<PlayerFeeStats>(this.url('stats'), { params: { season, sport } });
  }

  previewManualPayment(playerId: string, season: string, sport: SportEnum) {
    return this.http.get<{
      originalAmount: number | null;
      discountPct: number | null;
      discountReason: string | null;
      finalAmount: number | null;
    }>(this.url('manual-payment/preview'), { params: { playerId, season, sport } });
  }

  recordManualPayment(data: { playerId: string; season: string; sport: SportEnum; method: string }) {
    return this.http.post<void>(this.url('manual-payment'), data);
  }

  updateSeasonRecord(playerId: string, data: UpdateSeasonRecordPayload) {
    return this.http.patch<IPlayerSeasonRecord>(this.url(`season-record/${playerId}`), data);
  }

  // ── Configs ───────────────────────────────────────────────────────────────

  getConfigs() {
    return this.http.get<IPlayerFeeConfig[]>(this.url('config'));
  }

  createConfig(data: PlayerFeeConfigPayload) {
    return this.http.post<IPlayerFeeConfig>(this.url('config'), data);
  }

  updateConfig(id: string, data: Partial<PlayerFeeConfigPayload>) {
    return this.http.patch<IPlayerFeeConfig>(this.url(`config/${id}`), data);
  }

  activateConfig(id: string) {
    return this.http.post<IPlayerFeeConfig>(this.url(`config/${id}/activate`), {});
  }

  deactivateConfig(id: string) {
    return this.http.post<IPlayerFeeConfig>(this.url(`config/${id}/deactivate`), {});
  }

  deleteConfig(id: string) {
    return this.http.delete<void>(this.url(`config/${id}`));
  }

  // ── Familia ───────────────────────────────────────────────────────────────

  getFamilies() {
    return this.http.get<IFamilyGroup[]>(this.url('families'));
  }

  createFamily(data: FamilyGroupPayload) {
    return this.http.post<IFamilyGroup>(this.url('families'), data);
  }

  updateFamily(id: string, data: Partial<FamilyGroupPayload>) {
    return this.http.patch<IFamilyGroup>(this.url(`families/${id}`), data);
  }

  deleteFamily(id: string) {
    return this.http.delete<void>(this.url(`families/${id}`));
  }

  // ── BDUAR import ──────────────────────────────────────────────────────────

  importBduar(rows: BduarRow[], season: string) {
    return this.http.post<{ total: number; created: number; updated: number; recordsSet: number }>(
      this.url('import/bduar'), { rows, season }
    );
  }

  importFamilyGroups(groups: { name: string; dnis: string[] }[]) {
    return this.http.post<{ total: number; created: number; skipped: number; notFound: string[] }>(
      this.url('import/family-groups'), { groups }
    );
  }

}
