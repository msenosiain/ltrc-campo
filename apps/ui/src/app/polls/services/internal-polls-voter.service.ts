import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { InternalPollInfo, InternalPollResults } from '@ltrc-campo/shared-api-model';
import { API_CONFIG_TOKEN } from '../../app.config';

@Injectable({ providedIn: 'root' })
export class InternalPollsVoterService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);

  private url(matchId: string): string {
    return `${this.config.baseUrl}/matches/${matchId}/internal-poll`;
  }

  getInfo(matchId: string): Observable<InternalPollInfo> {
    return this.http.get<InternalPollInfo>(`${this.url(matchId)}/info`);
  }

  castVotes(
    matchId: string,
    votes: { awardId: string; playerId: string }[]
  ): Observable<{ voted: true }> {
    return this.http.post<{ voted: true }>(`${this.url(matchId)}/vote`, { votes });
  }

  getResults(matchId: string): Observable<InternalPollResults> {
    return this.http.get<InternalPollResults>(`${this.url(matchId)}/voter-results`);
  }
}
