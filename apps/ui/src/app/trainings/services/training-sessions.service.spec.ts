import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TrainingSessionsService } from './training-sessions.service';
import { API_CONFIG_TOKEN } from '../../app.config';
import { SportEnum, CategoryEnum } from '@ltrc-campo/shared-api-model';

const API_BASE = 'http://localhost:3000/api/v1';

describe('TrainingSessionsService', () => {
  let service: TrainingSessionsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        TrainingSessionsService,
        { provide: API_CONFIG_TOKEN, useValue: { baseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(TrainingSessionsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getAttendanceStats()', () => {
    const statsUrl = `${API_BASE}/training-sessions/stats/attendance`;
    const mockStats = { byCategory: {} };

    it('should GET stats with no query params when called with no filters', () => {
      service.getAttendanceStats().subscribe((res) => expect(res).toEqual(mockStats));

      const req = httpMock.expectOne(statsUrl);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toHaveLength(0);
      req.flush(mockStats);
    });

    it('should include sport param when filters.sport is provided', () => {
      service.getAttendanceStats({ sport: SportEnum.RUGBY }).subscribe();

      const req = httpMock.expectOne(`${statsUrl}?sport=${SportEnum.RUGBY}`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('sport')).toBe(SportEnum.RUGBY);
      expect(req.request.params.has('category')).toBe(false);
      req.flush(mockStats);
    });

    it('should include both sport and category params when both are provided', () => {
      service.getAttendanceStats({ sport: SportEnum.RUGBY, category: CategoryEnum.PLANTEL_SUPERIOR }).subscribe();

      const req = httpMock.expectOne(
        `${statsUrl}?sport=${SportEnum.RUGBY}&category=${CategoryEnum.PLANTEL_SUPERIOR}`
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('sport')).toBe(SportEnum.RUGBY);
      expect(req.request.params.get('category')).toBe(CategoryEnum.PLANTEL_SUPERIOR);
      req.flush(mockStats);
    });

    it('should include only category param when only category is provided', () => {
      service.getAttendanceStats({ category: CategoryEnum.M19 }).subscribe();

      const req = httpMock.expectOne(`${statsUrl}?category=${CategoryEnum.M19}`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('category')).toBe(CategoryEnum.M19);
      expect(req.request.params.has('sport')).toBe(false);
      req.flush(mockStats);
    });

    it('should not include params for undefined values in filters object', () => {
      service.getAttendanceStats({ sport: undefined, category: undefined }).subscribe();

      const req = httpMock.expectOne(statsUrl);
      expect(req.request.params.keys()).toHaveLength(0);
      req.flush(mockStats);
    });
  });

  it('getSessions() makes GET with pagination params', () => {
    service.getSessions({ page: 1, size: 10 }).subscribe();
    const req = httpMock.expectOne(r => r.url === `${API_BASE}/training-sessions` && r.params.get('page') === '1');
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], total: 0, page: 1, size: 10 });
  });

  it('getSessionById() makes GET to /:id', () => {
    service.getSessionById('s1').subscribe();
    const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('getUpcomingForCurrentUser() makes GET to /upcoming', () => {
    service.getUpcomingForCurrentUser(7).subscribe();
    const req = httpMock.expectOne(r => r.url === `${API_BASE}/training-sessions/upcoming`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('confirmAttendance() makes POST to /:id/confirm', () => {
    service.confirmAttendance('s1').subscribe();
    const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1/confirm`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('cancelConfirmation() makes DELETE to /:id/confirm', () => {
    service.cancelConfirmation('s1').subscribe();
    const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1/confirm`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('updateSession() makes PATCH to /:id', () => {
    service.updateSession('s1', { location: 'Campo 1' }).subscribe();
    const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('deleteSession() makes DELETE to /:id', () => {
    service.deleteSession('s1').subscribe();
    const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getCheckinToken() makes GET to /:id/checkin-token', () => {
    service.getCheckinToken('s1').subscribe();
    const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1/checkin-token`);
    expect(req.request.method).toBe('GET');
    req.flush({ token: 'tok', validFrom: '', validUntil: '' });
  });

  it('checkin() makes POST to /:id/checkin', () => {
    service.checkin('s1', 'tok-123').subscribe();
    const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1/checkin`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'ok' });
  });

  it('recordAttendance() makes PATCH to /:id/attendance', () => {
    service.recordAttendance('s1', [{ isStaff: false }]).subscribe();
    const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1/attendance`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });
});
