import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API_CONFIG_TOKEN } from '../../app.config';
import {
  IPayment,
  IPaymentLink,
  IPaymentLinkPublicInfo,
  PaymentEntityTypeEnum,
} from '@ltrc-campo/shared-api-model';

export interface FeePreview {
  mpFeeRate: number;
  grossAmount: number;
  mpFeeAmount: number;
  netAmount: number;
}

export interface CreatePaymentLinkPayload {
  entityType: PaymentEntityTypeEnum;
  entityId?: string;
  entityIds?: string[];
  concept: string;
  description?: string;
  amount: number;
  paymentType: string;
  installmentNumber?: number;
  installmentTotal?: number;
  expiresAt: string;
}

export interface RecordManualPaymentPayload {
  entityType: PaymentEntityTypeEnum;
  entityId: string;
  playerId: string;
  amount: number;
  method: string;
  concept: string;
  date: string;
  notes?: string;
}

export interface ValidateResult {
  playerId: string;
  playerName: string;
}

export interface CheckoutResult {
  checkoutUrl: string;
}

export interface EncounterPaymentRow {
  playerName: string;
  playerDni: string;
  concept: string;
  method: string;
  amount: number;
  date: string;
}

export interface EncounterCategorySummary {
  matchId: string;
  category: string;
  categoryLabel: string;
  count: number;
  total: number;
  payments: EncounterPaymentRow[];
}

export interface EncounterReport {
  encounterLabel: string;
  date: string;
  time?: string;
  opponent?: string;
  categories: EncounterCategorySummary[];
  grandTotal: number;
  grandCount: number;
}

export interface ConfirmResult {
  status: string;
}

export interface GlobalPaymentRow {
  id: string;
  playerName: string;
  playerDni: string;
  playerSport: string | null;
  playerCategory: string | null;
  entityType: PaymentEntityTypeEnum;
  entityLabel: string;
  concept: string;
  method: string;
  amount: number;
  status: string;
  date: string;
  notes?: string;
}

export interface GlobalPaymentsReport {
  data: GlobalPaymentRow[];
  total: number;
  page: number;
  limit: number;
  totalApproved: number;
}

export interface GlobalReportFilters {
  status?: string;
  method?: string;
  concept?: string;
  entityType?: string;
  sport?: string;
  category?: string;
  tournamentId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);
  private readonly apiUrl = `${this.config.baseUrl}/payments`;

  // ── Links ─────────────────────────────────────────────────────────────────

  createLink(payload: CreatePaymentLinkPayload) {
    return this.http.post<IPaymentLink>(`${this.apiUrl}/links`, payload);
  }

  getLinks(entityType: PaymentEntityTypeEnum, entityId: string) {
    const params = new HttpParams()
      .set('entityType', entityType)
      .set('entityId', entityId);
    return this.http.get<IPaymentLink[]>(`${this.apiUrl}/links`, { params });
  }

  cancelLink(id: string) {
    return this.http.delete<IPaymentLink>(`${this.apiUrl}/links/${id}`);
  }

  getConfig() {
    return this.http.get<{ mpFeeRate: number; excludedPaymentTypes: string[] }>(`${this.apiUrl}/config`);
  }

  updatePaymentConfig(excludedPaymentTypes: string[]) {
    return this.http.patch<{ excludedPaymentTypes: string[] }>(`${this.apiUrl}/config`, { excludedPaymentTypes });
  }

  getFieldOptions() {
    return this.http.get<{ concepts: string[] }>(`${this.apiUrl}/field-options`);
  }

  getFeePreview(amount: number) {
    const params = new HttpParams().set('amount', String(amount));
    return this.http.get<FeePreview>(`${this.apiUrl}/fee-preview`, { params });
  }

  // ── Pagos ─────────────────────────────────────────────────────────────────

  getPayments(entityType: PaymentEntityTypeEnum, entityId: string) {
    const params = new HttpParams()
      .set('entityType', entityType)
      .set('entityId', entityId);
    return this.http.get<IPayment[]>(`${this.apiUrl}`, { params });
  }

  recordManual(payload: RecordManualPaymentPayload) {
    return this.http.post<IPayment>(`${this.apiUrl}`, payload);
  }

  deleteManual(id: string) {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  syncPayment(id: string) {
    return this.http.post<{ status: string; updated: boolean }>(`${this.apiUrl}/${id}/sync`, {});
  }

  downloadPdfReport(entityType: PaymentEntityTypeEnum, entityId: string) {
    const params = new HttpParams()
      .set('entityType', entityType)
      .set('entityId', entityId);
    return this.http.get(`${this.apiUrl}/report/pdf`, {
      params,
      responseType: 'blob',
    });
  }

  getGlobalReport(filters: GlobalReportFilters) {
    let params = new HttpParams();
    if (filters.status) params = params.set('status', filters.status);
    if (filters.method) params = params.set('method', filters.method);
    if (filters.concept) params = params.set('concept', filters.concept);
    if (filters.entityType) params = params.set('entityType', filters.entityType);
    if (filters.sport) params = params.set('sport', filters.sport);
    if (filters.category) params = params.set('category', filters.category);
    if (filters.tournamentId) params = params.set('tournamentId', filters.tournamentId);
    if (filters.dateFrom) params = params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params = params.set('dateTo', filters.dateTo);
    if (filters.page) params = params.set('page', String(filters.page));
    if (filters.limit) params = params.set('limit', String(filters.limit));
    if (filters.sortBy) params = params.set('sortBy', filters.sortBy);
    if (filters.sortDir) params = params.set('sortDir', filters.sortDir);
    return this.http.get<GlobalPaymentsReport>(`${this.apiUrl}/report/global`, { params });
  }

  getEncounterReport(matchIds: string[]) {
    const params = new HttpParams().set('matchIds', matchIds.join(','));
    return this.http.get<EncounterReport>(`${this.apiUrl}/report/encounter`, { params });
  }

  downloadEncounterPdf(matchIds: string[]) {
    const params = new HttpParams().set('matchIds', matchIds.join(','));
    return this.http.get(`${this.apiUrl}/report/encounter/pdf`, {
      params,
      responseType: 'blob',
    });
  }

  // ── Públicos ──────────────────────────────────────────────────────────────

  getPublicLinkInfo(token: string) {
    return this.http.get<IPaymentLinkPublicInfo>(
      `${this.apiUrl}/public/links/${token}`
    );
  }

  validateDni(token: string, dni: string) {
    return this.http.post<ValidateResult>(
      `${this.apiUrl}/public/links/${token}/validate`,
      { dni }
    );
  }

  initiateCheckout(token: string, dni: string) {
    return this.http.post<CheckoutResult>(
      `${this.apiUrl}/public/links/${token}/checkout`,
      { dni }
    );
  }

  findPlayerByDni(dni: string) {
    return this.http.get<ValidateResult>(`${this.apiUrl}/internal/players/by-dni/${dni}`);
  }

  confirmPayment(externalReference: string, paymentId?: string, status?: string) {
    return this.http.post<ConfirmResult>(`${this.apiUrl}/public/confirm`, {
      externalReference,
      paymentId,
      status,
    });
  }
}
