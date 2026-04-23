import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CategoryEnum,
  HockeyBranchEnum,
  PaginatedResponse,
  PaginationQuery,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import { API_CONFIG_TOKEN } from '../../app.config';
import { User } from '../User.interface';
import { Player } from '@ltrc-campo/shared-api-model';

export interface CreateUserPayload {
  name: string;
  memberNumber?: string;
  idNumber?: string;
  email: string;
  roles?: string[];
  password?: string;
  sports?: SportEnum[];
  categories?: CategoryEnum[];
  branches?: HockeyBranchEnum[];
}

export interface UpdateUserPayload {
  name?: string;
  memberNumber?: string;
  idNumber?: string;
  email?: string;
  roles?: string[];
  sports?: SportEnum[];
  categories?: CategoryEnum[];
  branches?: HockeyBranchEnum[];
}

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private readonly httpClient = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);
  private readonly usersApiUrl = `${this.config.baseUrl}/users`;
  private readonly playersApiUrl = `${this.config.baseUrl}/players`;

  getUsers(query: PaginationQuery): Observable<PaginatedResponse<User>> {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page);
    if (query.size) params = params.set('size', query.size);
    if (query.filters && Object.keys(query.filters).length > 0)
      params = params.set('filters', JSON.stringify(query.filters));
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortOrder) params = params.set('sortOrder', query.sortOrder);

    return this.httpClient.get<PaginatedResponse<User>>(this.usersApiUrl, {
      params,
    });
  }

  getUserById(id: string): Observable<User> {
    return this.httpClient.get<User>(`${this.usersApiUrl}/${id}`);
  }

  createUser(payload: CreateUserPayload): Observable<User> {
    return this.httpClient.post<User>(this.usersApiUrl, payload);
  }

  updateUser(id: string, payload: UpdateUserPayload): Observable<User> {
    return this.httpClient.patch<User>(`${this.usersApiUrl}/${id}`, payload);
  }

  deleteUser(id: string): Observable<void> {
    return this.httpClient.delete<void>(`${this.usersApiUrl}/${id}`);
  }

  resetPassword(id: string): Observable<{ message: string }> {
    return this.httpClient.post<{ message: string }>(
      `${this.usersApiUrl}/${id}/reset-password`,
      {}
    );
  }

  getLinkedPlayer(userId: string): Observable<Player | null> {
    return this.httpClient.get<Player | null>(
      `${this.playersApiUrl}/by-user/${userId}`
    );
  }
}
