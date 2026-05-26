import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  PaginatedResponse,
  PaginationQuery,
  TrainingSession,
  TrainingSessionAttachment,
  UpcomingTraining,
  VideoVisibility,
} from '@ltrc-campo/shared-api-model';
import { API_CONFIG_TOKEN } from '../../app.config';

@Injectable({
  providedIn: 'root',
})
export class TrainingSessionsService {
  private readonly httpClient = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);
  private readonly apiUrl = `${this.config.baseUrl}/training-sessions`;

  getSessions(
    query: PaginationQuery
  ): Observable<PaginatedResponse<TrainingSession>> {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page);
    if (query.size) params = params.set('size', query.size);
    if (query.filters && Object.keys(query.filters).length > 0)
      params = params.set('filters', JSON.stringify(query.filters));
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortOrder) params = params.set('sortOrder', query.sortOrder);

    return this.httpClient.get<PaginatedResponse<TrainingSession>>(
      this.apiUrl,
      { params }
    );
  }

  getSessionById(id: string): Observable<TrainingSession> {
    return this.httpClient.get<TrainingSession>(`${this.apiUrl}/${id}`);
  }

  getUpcomingForCurrentUser(days = 7): Observable<UpcomingTraining[]> {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const params = new HttpParams().set('days', days).set('today', today);
    return this.httpClient.get<UpcomingTraining[]>(`${this.apiUrl}/upcoming`, {
      params,
    });
  }

  confirmAttendance(sessionId: string): Observable<TrainingSession> {
    return this.httpClient.post<TrainingSession>(
      `${this.apiUrl}/${sessionId}/confirm`,
      {}
    );
  }

  cancelConfirmation(sessionId: string): Observable<TrainingSession> {
    return this.httpClient.delete<TrainingSession>(
      `${this.apiUrl}/${sessionId}/confirm`
    );
  }

  getStaffForSession(sessionId: string): Observable<{ id: string; name: string; roles: string[] }[]> {
    return this.httpClient.get<{ id: string; name: string; roles: string[] }[]>(
      `${this.apiUrl}/${sessionId}/staff-options`
    );
  }

  recordAttendance(
    sessionId: string,
    records: {
      playerId?: string;
      userId?: string;
      userName?: string;
      isStaff: boolean;
      status?: string | null;
      confirmed?: boolean;
    }[]
  ): Observable<TrainingSession> {
    return this.httpClient.patch<TrainingSession>(
      `${this.apiUrl}/${sessionId}/attendance`,
      { records }
    );
  }

  getAttendanceStats(filters?: { sport?: string; category?: string }): Observable<{
    byCategory: Record<string, { sessions: number; totalPresent: number; totalAttendees: number; pct: number }>;
  }> {
    let params = new HttpParams();
    if (filters?.sport) params = params.set('sport', filters.sport);
    if (filters?.category) params = params.set('category', filters.category);
    return this.httpClient.get<{
      byCategory: Record<string, { sessions: number; totalPresent: number; totalAttendees: number; pct: number }>;
    }>(`${this.apiUrl}/stats/attendance`, { params });
  }

  updateSession(
    id: string,
    data: { startTime?: string; endTime?: string; location?: string; notes?: string; status?: string }
  ): Observable<TrainingSession> {
    return this.httpClient.patch<TrainingSession>(`${this.apiUrl}/${id}`, data);
  }

  deleteSession(id: string): Observable<void> {
    return this.httpClient.delete<void>(`${this.apiUrl}/${id}`);
  }

  checkin(sessionId: string, token: string): Observable<{ message: string }> {
    return this.httpClient.post<{ message: string }>(
      `${this.apiUrl}/${sessionId}/checkin`,
      { token }
    );
  }

  getCheckinToken(sessionId: string): Observable<{ token: string; validFrom: string; validUntil: string }> {
    return this.httpClient.get<{ token: string; validFrom: string; validUntil: string }>(
      `${this.apiUrl}/${sessionId}/checkin-token`
    );
  }

  getAttachmentUrl(sessionId: string, fileId: string): string {
    return `${this.apiUrl}/${sessionId}/attachments/${fileId}`;
  }

  fetchAttachmentBlob(sessionId: string, fileId: string): Observable<Blob> {
    return this.httpClient.get(`${this.apiUrl}/${sessionId}/attachments/${fileId}`, {
      responseType: 'blob',
    });
  }

  uploadAttachment(
    sessionId: string,
    file: File,
    name?: string,
    visibility: VideoVisibility = 'all',
    targetPlayers?: string[]
  ): Observable<TrainingSessionAttachment> {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    form.append('visibility', visibility);
    if (targetPlayers?.length) form.append('targetPlayers', JSON.stringify(targetPlayers));
    return this.httpClient.post<TrainingSessionAttachment>(
      `${this.apiUrl}/${sessionId}/attachments`,
      form
    );
  }

  updateAttachment(
    sessionId: string,
    fileId: string,
    name: string,
    visibility: VideoVisibility,
    targetPlayers?: string[]
  ): Observable<TrainingSessionAttachment> {
    return this.httpClient.patch<TrainingSessionAttachment>(
      `${this.apiUrl}/${sessionId}/attachments/${fileId}`,
      { name, visibility, targetPlayers: targetPlayers ?? [] }
    );
  }

  deleteAttachment(sessionId: string, fileId: string): Observable<void> {
    return this.httpClient.delete<void>(
      `${this.apiUrl}/${sessionId}/attachments/${fileId}`
    );
  }
}
