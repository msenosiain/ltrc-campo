import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  PaginatedResponse,
  PaginationQuery,
  Trip,
  TripFilters,
  TripParticipantStatusEnum,
  TripParticipantTypeEnum,
  TripStatusEnum,
  TransportTypeEnum,
} from '@ltrc-campo/shared-api-model';
import { API_CONFIG_TOKEN } from '../../app.config';

export interface CreateTripPayload {
  name: string;
  destination: string;
  sport?: string | null;
  categories?: string[];
  departureDate: string;
  returnDate?: string | null;
  registrationDeadline?: string | null;
  costPerPerson: number;
  maxParticipants?: number | null;
  status?: TripStatusEnum;
  linkedTournament?: string | null;
  description?: string;
}

export interface AddParticipantPayload {
  type: TripParticipantTypeEnum;
  playerId?: string;
  userId?: string;
  externalName?: string;
  externalDni?: string;
  externalRole?: string;
  status?: TripParticipantStatusEnum;
  costAssigned?: number;
  specialNeeds?: string;
  accompanyingParticipantId?: string;
}

export interface UpdateParticipantPayload {
  status?: TripParticipantStatusEnum;
  costAssigned?: number;
  specialNeeds?: string;
  documentationOk?: boolean;
  accompanyingParticipantId?: string;
}

export interface RecordPaymentPayload {
  amount: number;
  date: string;
  method?: string;
  notes?: string;
}

export interface AddTransportPayload {
  name: string;
  type: TransportTypeEnum;
  capacity: number;
  company?: string;
  departureTime?: string;
  notes?: string;
}

@Injectable({ providedIn: 'root' })
export class TripsService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);
  private readonly baseUrl = `${this.config.baseUrl}/trips`;

  getTrips(query: PaginationQuery): Observable<PaginatedResponse<Trip>> {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page);
    if (query.size) params = params.set('size', query.size);
    if (query.filters && Object.keys(query.filters).length > 0)
      params = params.set('filters', JSON.stringify(query.filters));
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortOrder) params = params.set('sortOrder', query.sortOrder);
    return this.http.get<PaginatedResponse<Trip>>(this.baseUrl, { params });
  }

  getTripById(id: string): Observable<Trip> {
    return this.http.get<Trip>(`${this.baseUrl}/${id}`);
  }

  createTrip(payload: CreateTripPayload): Observable<Trip> {
    return this.http.post<Trip>(this.baseUrl, payload);
  }

  updateTrip(id: string, payload: Partial<CreateTripPayload>): Observable<Trip> {
    return this.http.patch<Trip>(`${this.baseUrl}/${id}`, payload);
  }

  deleteTrip(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  // ── Participantes ──────────────────────────────────────────────────────────

  addParticipant(tripId: string, payload: AddParticipantPayload): Observable<Trip> {
    return this.http.post<Trip>(`${this.baseUrl}/${tripId}/participants`, payload);
  }

  bulkAddParticipants(tripId: string, participants: AddParticipantPayload[]): Observable<Trip> {
    return this.http.post<Trip>(`${this.baseUrl}/${tripId}/participants/bulk`, { participants });
  }

  bulkUpdateStatus(tripId: string, participantIds: string[], status: TripParticipantStatusEnum): Observable<Trip> {
    return this.http.patch<Trip>(`${this.baseUrl}/${tripId}/participants/bulk-status`, { participantIds, status });
  }

  updateParticipant(
    tripId: string,
    participantId: string,
    payload: UpdateParticipantPayload
  ): Observable<Trip> {
    return this.http.patch<Trip>(
      `${this.baseUrl}/${tripId}/participants/${participantId}`,
      payload
    );
  }

  removeParticipant(tripId: string, participantId: string): Observable<Trip> {
    return this.http.delete<Trip>(
      `${this.baseUrl}/${tripId}/participants/${participantId}`
    );
  }

  removeAllParticipants(tripId: string): Observable<Trip> {
    return this.http.delete<Trip>(`${this.baseUrl}/${tripId}/participants`);
  }

  recordPayment(
    tripId: string,
    participantId: string,
    payload: RecordPaymentPayload
  ): Observable<Trip> {
    return this.http.post<Trip>(
      `${this.baseUrl}/${tripId}/participants/${participantId}/payments`,
      payload
    );
  }

  removePayment(
    tripId: string,
    participantId: string,
    paymentId: string
  ): Observable<Trip> {
    return this.http.delete<Trip>(
      `${this.baseUrl}/${tripId}/participants/${participantId}/payments/${paymentId}`
    );
  }

  // ── Transportes ───────────────────────────────────────────────────────────

  addTransport(tripId: string, payload: AddTransportPayload): Observable<Trip> {
    return this.http.post<Trip>(`${this.baseUrl}/${tripId}/transports`, payload);
  }

  updateTransport(
    tripId: string,
    transportId: string,
    payload: Partial<AddTransportPayload>
  ): Observable<Trip> {
    return this.http.patch<Trip>(
      `${this.baseUrl}/${tripId}/transports/${transportId}`,
      payload
    );
  }

  removeTransport(tripId: string, transportId: string): Observable<Trip> {
    return this.http.delete<Trip>(
      `${this.baseUrl}/${tripId}/transports/${transportId}`
    );
  }

  draftTransportAssignment(tripId: string): Observable<Trip> {
    return this.http.post<Trip>(`${this.baseUrl}/${tripId}/transports/draft`, {});
  }

  moveParticipant(
    tripId: string,
    participantId: string,
    transportId: string | null
  ): Observable<Trip> {
    return this.http.patch<Trip>(
      `${this.baseUrl}/${tripId}/participants/${participantId}/transport`,
      { transportId }
    );
  }
}
