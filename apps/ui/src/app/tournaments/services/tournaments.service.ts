import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CategoryEnum,
  MatchTypeEnum,
  PaginatedResponse,
  PaginationQuery,
  SportEnum,
  Tournament,
} from '@ltrc-campo/shared-api-model';
import { API_CONFIG_TOKEN } from '../../app.config';

export interface TournamentFormValue {
  name: string;
  season?: string;
  description?: string;
  sport?: SportEnum | null;
  categories?: CategoryEnum[];
  type?: MatchTypeEnum | null;
  logoFileId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class TournamentsService {
  private readonly httpClient = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);
  private readonly tournamentsApiUrl = `${this.config.baseUrl}/tournaments`;

  getTournaments(
    query: PaginationQuery
  ): Observable<PaginatedResponse<Tournament>> {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page);
    if (query.size) params = params.set('size', query.size);
    if (query.filters && Object.keys(query.filters).length > 0)
      params = params.set('filters', JSON.stringify(query.filters));
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortOrder) params = params.set('sortOrder', query.sortOrder);
    return this.httpClient.get<PaginatedResponse<Tournament>>(
      this.tournamentsApiUrl,
      { params }
    );
  }

  getTournamentById(id: string): Observable<Tournament> {
    return this.httpClient.get<Tournament>(`${this.tournamentsApiUrl}/${id}`);
  }

  createTournament(dto: TournamentFormValue): Observable<Tournament> {
    return this.httpClient.post<Tournament>(this.tournamentsApiUrl, dto);
  }

  updateTournament(
    id: string,
    dto: Partial<TournamentFormValue>
  ): Observable<Tournament> {
    return this.httpClient.patch<Tournament>(
      `${this.tournamentsApiUrl}/${id}`,
      dto
    );
  }

  deleteTournament(id: string): Observable<void> {
    return this.httpClient.delete<void>(`${this.tournamentsApiUrl}/${id}`);
  }

  uploadLogo(tournamentId: string, file: File): Observable<Tournament> {
    const formData = new FormData();
    formData.append('file', file);
    return this.httpClient.post<Tournament>(
      `${this.tournamentsApiUrl}/${tournamentId}/logo`,
      formData
    );
  }

  getLogoUrl(tournamentId: string): string {
    return `${this.tournamentsApiUrl}/${tournamentId}/logo`;
  }

  deleteLogo(tournamentId: string): Observable<Tournament> {
    return this.httpClient.delete<Tournament>(
      `${this.tournamentsApiUrl}/${tournamentId}/logo`
    );
  }

  uploadAttachment(tournamentId: string, file: File): Observable<Tournament> {
    const formData = new FormData();
    formData.append('file', file);
    return this.httpClient.post<Tournament>(
      `${this.tournamentsApiUrl}/${tournamentId}/attachments`,
      formData
    );
  }

  getAttachmentUrl(tournamentId: string, attachmentId: string): string {
    return `${this.tournamentsApiUrl}/${tournamentId}/attachments/${attachmentId}`;
  }

  deleteAttachment(
    tournamentId: string,
    attachmentId: string
  ): Observable<Tournament> {
    return this.httpClient.delete<Tournament>(
      `${this.tournamentsApiUrl}/${tournamentId}/attachments/${attachmentId}`
    );
  }
}
