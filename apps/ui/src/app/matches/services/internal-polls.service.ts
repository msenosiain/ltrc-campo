import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { InternalPoll, InternalPollResults } from '@ltrc-campo/shared-api-model';
import { API_CONFIG_TOKEN } from '../../app.config';

@Injectable({ providedIn: 'root' })
export class InternalPollsAdminService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);

  private url(matchId: string): string {
    return `${this.config.baseUrl}/matches/${matchId}/internal-poll`;
  }

  create(
    matchId: string,
    awards: { name: string }[],
    startsAt: Date,
    endsAt: Date,
    staffVoterIds: string[]
  ): Observable<InternalPoll> {
    return this.http.post<InternalPoll>(this.url(matchId), {
      awards,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      staffVoterIds,
    });
  }

  get(matchId: string): Observable<InternalPoll | null> {
    return this.http.get<InternalPoll | null>(this.url(matchId));
  }

  update(
    matchId: string,
    awards: { name: string }[],
    startsAt: Date,
    endsAt: Date,
    staffVoterIds: string[]
  ): Observable<InternalPoll> {
    return this.http.patch<InternalPoll>(this.url(matchId), {
      awards,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      staffVoterIds,
    });
  }

  delete(matchId: string): Observable<void> {
    return this.http.delete<void>(this.url(matchId));
  }

  getResults(matchId: string): Observable<InternalPollResults> {
    return this.http.get<InternalPollResults>(`${this.url(matchId)}/results`);
  }

  searchStaff(matchId: string, q: string): Observable<{ id: string; name: string; roles: string[] }[]> {
    const params = new HttpParams().set('q', q);
    return this.http.get<{ id: string; name: string; roles: string[] }[]>(
      `${this.url(matchId)}/staff-search`,
      { params }
    );
  }
}
