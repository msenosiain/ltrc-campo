import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CategoryEnum, SportEnum, Squad } from '@ltrc-campo/shared-api-model';
import { API_CONFIG_TOKEN } from '../../app.config';

export interface SquadPayloadEntry {
  shirtNumber: number;
  playerId: string;
}

export interface SquadPayload {
  name: string;
  sport?: SportEnum;
  category?: CategoryEnum;
  players: SquadPayloadEntry[];
}

@Injectable({ providedIn: 'root' })
export class SquadsService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);
  private readonly baseUrl = `${this.config.baseUrl}/squads`;

  getSquads(sport?: SportEnum | null, category?: CategoryEnum): Observable<Squad[]> {
    let params = new HttpParams();
    if (sport) params = params.set('sport', sport);
    if (category) params = params.set('category', category);
    return this.http.get<Squad[]>(this.baseUrl, { params });
  }

  getSquad(id: string): Observable<Squad> {
    return this.http.get<Squad>(`${this.baseUrl}/${id}`);
  }

  createSquad(payload: SquadPayload): Observable<Squad> {
    return this.http.post<Squad>(this.baseUrl, payload);
  }

  updateSquad(id: string, payload: Partial<SquadPayload>): Observable<Squad> {
    return this.http.patch<Squad>(`${this.baseUrl}/${id}`, payload);
  }

  deleteSquad(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
