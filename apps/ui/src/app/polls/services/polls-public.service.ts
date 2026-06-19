import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MatchPollPublicInfo, PollResults } from '@ltrc-campo/shared-api-model';
import { API_CONFIG_TOKEN } from '../../app.config';

@Injectable({ providedIn: 'root' })
export class PollsPublicService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);

  private url(token: string): string {
    return `${this.config.baseUrl}/polls/public/${token}`;
  }

  getInfo(token: string): Observable<MatchPollPublicInfo> {
    return this.http.get<MatchPollPublicInfo>(this.url(token));
  }

  castVote(token: string, playerId: string): Observable<{ voted: true; totalVotes: number }> {
    return this.http.post<{ voted: true; totalVotes: number }>(`${this.url(token)}/vote`, { playerId });
  }

  getResults(token: string): Observable<PollResults> {
    return this.http.get<PollResults>(`${this.url(token)}/results`);
  }
}
