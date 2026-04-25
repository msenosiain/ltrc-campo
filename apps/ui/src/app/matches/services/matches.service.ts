import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AttendanceStatusEnum,
  CategoryEnum,
  HockeyBranchEnum,
  Match,
  MatchAttachment,
  MatchStatusEnum,
  PaginatedResponse,
  PaginationQuery,
  SportEnum,
  VideoClip,
  VideoVisibility,
} from '@ltrc-campo/shared-api-model';
import { API_CONFIG_TOKEN } from '../../app.config';
import { MatchFormValue } from '../forms/match-form.types';
import { mapFormToCreateMatchDto } from '../forms/match-form.mapper';
import { matchStatusOptions } from '../match-options';

@Injectable({
  providedIn: 'root',
})
export class MatchesService {
  private readonly httpClient = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);
  private readonly matchesApiUrl = `${this.config.baseUrl}/matches`;

  getFieldOptions(category?: string): Observable<{
    opponents: string[];
    venues: string[];
    divisions: string[];
    tournamentIds?: string[];
  }> {
    const url = category
      ? `${this.matchesApiUrl}/field-options?category=${encodeURIComponent(category)}`
      : `${this.matchesApiUrl}/field-options`;
    return this.httpClient.get<{
      opponents: string[];
      venues: string[];
      divisions: string[];
      tournamentIds?: string[];
    }>(url);
  }

  getMySquadMatches(query: PaginationQuery): Observable<PaginatedResponse<Match>> {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page);
    if (query.size) params = params.set('size', query.size);
    if (query.filters && Object.keys(query.filters).length > 0)
      params = params.set('filters', JSON.stringify(query.filters));
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortOrder) params = params.set('sortOrder', query.sortOrder);

    return this.httpClient.get<PaginatedResponse<Match>>(`${this.matchesApiUrl}/my-squad`, { params });
  }

  getMatches(query: PaginationQuery): Observable<PaginatedResponse<Match>> {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page);
    if (query.size) params = params.set('size', query.size);
    if (query.filters && Object.keys(query.filters).length > 0)
      params = params.set('filters', JSON.stringify(query.filters));
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortOrder) params = params.set('sortOrder', query.sortOrder);

    return this.httpClient.get<PaginatedResponse<Match>>(this.matchesApiUrl, {
      params,
    });
  }

  getMatchById(id: string): Observable<Match> {
    return this.httpClient.get<Match>(`${this.matchesApiUrl}/${id}`);
  }

  createMatch(formValue: MatchFormValue): Observable<Match> {
    const dto = mapFormToCreateMatchDto(formValue);
    return this.httpClient.post<Match>(this.matchesApiUrl, dto);
  }

  createMatchesBulk(dto: {
    categories: CategoryEnum[];
    opponent?: string;
    date: string;
    name?: string;
    venue: string;
    isHome?: boolean;
    status?: MatchStatusEnum;
    sport?: SportEnum;
    branch?: HockeyBranchEnum | null;
    tournament?: string;
    notes?: string;
  }): Observable<Match[]> {
    const payload = { ...dto, branch: dto.branch || undefined };
    return this.httpClient.post<Match[]>(`${this.matchesApiUrl}/bulk`, payload);
  }

  updateMatch(id: string, formValue: MatchFormValue): Observable<Match> {
    const dto = mapFormToCreateMatchDto(formValue);
    return this.httpClient.patch<Match>(`${this.matchesApiUrl}/${id}`, dto);
  }

  patchStatus(id: string, status: MatchStatusEnum): Observable<Match> {
    return this.httpClient.patch<Match>(`${this.matchesApiUrl}/${id}`, { status });
  }

  patchResult(id: string, homeScore: number, awayScore: number): Observable<Match> {
    return this.httpClient.patch<Match>(`${this.matchesApiUrl}/${id}`, { result: { homeScore, awayScore } });
  }

  deleteMatch(id: string): Observable<void> {
    return this.httpClient.delete<void>(`${this.matchesApiUrl}/${id}`);
  }

  getStatusLabel(status: MatchStatusEnum): string {
    return matchStatusOptions.find((o) => o.id === status)?.label ?? status;
  }

  updateSquad(
    matchId: string,
    squad: { shirtNumber: number; dorsalNumber?: number; isCaptain?: boolean; playerId: string }[]
  ): Observable<Match> {
    return this.httpClient.patch<Match>(
      `${this.matchesApiUrl}/${matchId}/squad`,
      { squad }
    );
  }

  getAttachmentUrl(matchId: string, fileId: string): string {
    return `${this.matchesApiUrl}/${matchId}/attachments/${fileId}`;
  }

  fetchAttachmentBlob(matchId: string, fileId: string) {
    return this.httpClient.get(
      `${this.matchesApiUrl}/${matchId}/attachments/${fileId}`,
      { responseType: 'blob' }
    );
  }

  addVideo(matchId: string, dto: { url: string; name: string; description?: string; visibility: VideoVisibility; targetPlayers?: string[] }): Observable<VideoClip> {
    return this.httpClient.post<VideoClip>(`${this.matchesApiUrl}/${matchId}/videos`, dto);
  }

  updateVideo(matchId: string, videoId: string, dto: { url: string; name: string; description?: string; visibility: VideoVisibility; targetPlayers?: string[] }): Observable<VideoClip> {
    return this.httpClient.patch<VideoClip>(`${this.matchesApiUrl}/${matchId}/videos/${videoId}`, dto);
  }

  deleteVideo(matchId: string, videoId: string): Observable<void> {
    return this.httpClient.delete<void>(`${this.matchesApiUrl}/${matchId}/videos/${videoId}`);
  }

  uploadAttachment(matchId: string, file: File, name?: string, visibility = 'all', targetPlayers?: string[]): Observable<MatchAttachment> {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    form.append('visibility', visibility);
    if (targetPlayers?.length) form.append('targetPlayers', JSON.stringify(targetPlayers));
    return this.httpClient.post<MatchAttachment>(
      `${this.matchesApiUrl}/${matchId}/attachments`,
      form
    );
  }

  updateAttachment(matchId: string, fileId: string, name: string, visibility: string, targetPlayers?: string[]): Observable<MatchAttachment> {
    return this.httpClient.patch<MatchAttachment>(
      `${this.matchesApiUrl}/${matchId}/attachments/${fileId}`,
      { name, visibility, targetPlayers: targetPlayers ?? [] }
    );
  }

  deleteAttachment(matchId: string, fileId: string): Observable<void> {
    return this.httpClient.delete<void>(
      `${this.matchesApiUrl}/${matchId}/attachments/${fileId}`
    );
  }

  getAttendanceStats(filters?: { sport?: SportEnum; category?: CategoryEnum }): Observable<{
    byCategory: Record<string, { matches: number; totalPresent: number; totalAttendees: number; pct: number }>;
  }> {
    let params = new HttpParams();
    if (filters?.sport) params = params.set('sport', filters.sport);
    if (filters?.category) params = params.set('category', filters.category);
    return this.httpClient.get<{
      byCategory: Record<string, { matches: number; totalPresent: number; totalAttendees: number; pct: number }>;
    }>(`${this.matchesApiUrl}/stats/attendance`, { params });
  }

  applySquadFromTemplate(matchId: string, squadId: string): Observable<Match> {
    return this.httpClient.post<Match>(
      `${this.matchesApiUrl}/${matchId}/squad/from/${squadId}`,
      {}
    );
  }

  recordAttendance(
    matchId: string,
    records: {
      playerId?: string;
      userId?: string;
      isStaff: boolean;
      status: AttendanceStatusEnum;
    }[]
  ): Observable<Match> {
    return this.httpClient.patch<Match>(
      `${this.matchesApiUrl}/${matchId}/attendance`,
      { records }
    );
  }
}
