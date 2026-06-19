import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MatchPoll, PollResults } from '@ltrc-campo/shared-api-model';
import { API_CONFIG_TOKEN } from '../../app.config';

@Injectable({ providedIn: 'root' })
export class PollsAdminService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);

  private url(matchId: string): string {
    return `${this.config.baseUrl}/matches/${matchId}/poll`;
  }

  create(matchId: string, startsAt: Date, endsAt: Date): Observable<MatchPoll> {
    return this.http.post<MatchPoll>(this.url(matchId), {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    });
  }

  get(matchId: string): Observable<MatchPoll | null> {
    return this.http.get<MatchPoll | null>(this.url(matchId));
  }

  update(matchId: string, startsAt: Date, endsAt: Date): Observable<MatchPoll> {
    return this.http.patch<MatchPoll>(this.url(matchId), {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    });
  }

  delete(matchId: string): Observable<void> {
    return this.http.delete<void>(this.url(matchId));
  }

  getResults(slug: string): Observable<PollResults> {
    return this.http.get<PollResults>(`${this.config.baseUrl}/polls/public/${slug}/results`);
  }
}
