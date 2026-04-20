import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CategoryEnum,
  CategoryEvaluationSettings,
  PlayerEvaluation,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import { API_CONFIG_TOKEN } from '../../app.config';

export interface UpsertEvaluationPayload {
  playerId: string;
  category: CategoryEnum;
  sport: SportEnum;
  period: string;
  date: string;
  skills: {
    skill: string;
    subcriteria: { name: string; score: 0 | 1 | 2 | 3 }[];
  }[];
  notes?: string;
}

@Injectable({ providedIn: 'root' })
export class EvaluationsService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);
  private readonly apiUrl = `${this.config.baseUrl}/evaluations`;

  // Settings
  getAllSettings(): Observable<CategoryEvaluationSettings[]> {
    return this.http.get<CategoryEvaluationSettings[]>(`${this.apiUrl}/settings`);
  }

  toggleSettings(
    category: CategoryEnum,
    sport: SportEnum,
    enabled: boolean,
  ): Observable<CategoryEvaluationSettings> {
    return this.http.post<CategoryEvaluationSettings>(`${this.apiUrl}/settings`, {
      category,
      sport,
      evaluationsEnabled: enabled,
    });
  }

  // Evaluations
  getByCategory(
    category: CategoryEnum | null,
    sport: SportEnum | null,
    period: string,
  ): Observable<PlayerEvaluation[]> {
    let params = new HttpParams().set('period', period);
    if (category) params = params.set('category', category);
    if (sport) params = params.set('sport', sport);
    return this.http.get<PlayerEvaluation[]>(this.apiUrl, { params });
  }

  getByPlayer(playerId: string): Observable<PlayerEvaluation[]> {
    return this.http.get<PlayerEvaluation[]>(`${this.apiUrl}/player/${playerId}`);
  }

  upsert(payload: UpsertEvaluationPayload): Observable<PlayerEvaluation> {
    return this.http.post<PlayerEvaluation>(this.apiUrl, payload);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
