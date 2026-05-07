import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { MatchesService } from './matches.service';
import { API_CONFIG_TOKEN } from '../../app.config';
import { MatchStatusEnum } from '@ltrc-campo/shared-api-model';

const API_BASE = 'http://localhost:3000/api/v1';

describe('MatchesService', () => {
  let service: MatchesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        MatchesService,
        { provide: API_CONFIG_TOKEN, useValue: { baseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(MatchesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getMatches should GET /matches with page and size', () => {
    service.getMatches({ page: 1, size: 10 }).subscribe();
    const req = httpMock.expectOne(`${API_BASE}/matches?page=1&size=10`);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], total: 0, page: 1, size: 10 });
  });

  it('getMatchById should GET /matches/:id', () => {
    service.getMatchById('abc').subscribe();
    const req = httpMock.expectOne(`${API_BASE}/matches/abc`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('deleteMatch should DELETE /matches/:id', () => {
    service.deleteMatch('abc').subscribe();
    const req = httpMock.expectOne(`${API_BASE}/matches/abc`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getStatusLabel should return Spanish label', () => {
    expect(service.getStatusLabel(MatchStatusEnum.UPCOMING)).toBe('Próximo');
    expect(service.getStatusLabel(MatchStatusEnum.COMPLETED)).toBe(
      'Finalizado'
    );
    expect(service.getStatusLabel(MatchStatusEnum.CANCELLED)).toBe('Cancelado');
  });

  it('patchResult should PATCH /matches/:id with result payload', () => {
    service.patchResult('abc', 3, 1).subscribe();
    const req = httpMock.expectOne(`${API_BASE}/matches/abc`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ result: { homeScore: 3, awayScore: 1 } });
    req.flush({});
  });

  it('getFieldOptions() makes GET to /field-options', () => {
    service.getFieldOptions().subscribe();
    const req = httpMock.expectOne(`${API_BASE}/matches/field-options`);
    expect(req.request.method).toBe('GET');
    req.flush({ opponents: [], venues: [], divisions: [] });
  });

  it('getMySquadMatches() makes GET to /my-squad', () => {
    service.getMySquadMatches({ page: 1, size: 5 }).subscribe();
    const req = httpMock.expectOne(r => r.url === `${API_BASE}/matches/my-squad`);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], total: 0, page: 1, size: 5 });
  });

  it('createMatchesBulk() makes POST to /bulk', () => {
    service.createMatchesBulk({ categories: [], date: '2025-06-01', venue: 'Cancha A' } as any).subscribe();
    const req = httpMock.expectOne(`${API_BASE}/matches/bulk`);
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('updateSquad() makes PATCH to /:id/squad', () => {
    service.updateSquad('m1', []).subscribe();
    const req = httpMock.expectOne(`${API_BASE}/matches/m1/squad`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('recordAttendance() makes PATCH to /:id/attendance', () => {
    service.recordAttendance('m1', { records: [] }).subscribe();
    const req = httpMock.expectOne(`${API_BASE}/matches/m1/attendance`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('addVideo() makes POST to /:id/videos', () => {
    service.addVideo('m1', { url: 'https://yt.com', visibility: 'all' } as any).subscribe();
    const req = httpMock.expectOne(`${API_BASE}/matches/m1/videos`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('deleteVideo() makes DELETE to /:id/videos/:vid', () => {
    service.deleteVideo('m1', 'vid-1').subscribe();
    const req = httpMock.expectOne(`${API_BASE}/matches/m1/videos/vid-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getAttendanceStats() makes GET to /stats/attendance', () => {
    service.getAttendanceStats().subscribe();
    const req = httpMock.expectOne(`${API_BASE}/matches/stats/attendance`);
    expect(req.request.method).toBe('GET');
    req.flush({ byCategory: {} });
  });
});
