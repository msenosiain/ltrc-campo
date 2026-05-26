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

  // ── attachments ───────────────────────────────────────────────────────────

  describe('getAttachmentUrl()', () => {
    it('should return the correct URL string', () => {
      const url = service.getAttachmentUrl('s1', 'fid');
      expect(url).toBe(`${API_BASE}/training-sessions/s1/attachments/fid`);
    });
  });

  describe('fetchAttachmentBlob()', () => {
    it('should make GET with responseType blob', () => {
      service.fetchAttachmentBlob('s1', 'fid').subscribe();
      const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1/attachments/fid`);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob());
    });
  });

  describe('uploadAttachment()', () => {
    it('should POST FormData with file, name and visibility', () => {
      const file = new File(['content'], 'plan.pdf', { type: 'application/pdf' });
      service.uploadAttachment('s1', file, 'Plan físico', 'staff').subscribe();

      const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1/attachments`);
      expect(req.request.method).toBe('POST');
      const body = req.request.body as FormData;
      expect(body.get('name')).toBe('Plan físico');
      expect(body.get('visibility')).toBe('staff');
      expect(body.get('file')).toBeTruthy();
      req.flush({ fileId: 'fid', filename: 'plan.pdf', mimeType: 'application/pdf' });
    });

    it('should include targetPlayers JSON when provided', () => {
      const file = new File(['x'], 'f.pdf', { type: 'application/pdf' });
      service.uploadAttachment('s1', file, undefined, 'players', ['p1', 'p2']).subscribe();

      const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1/attachments`);
      const body = req.request.body as FormData;
      expect(JSON.parse(body.get('targetPlayers') as string)).toEqual(['p1', 'p2']);
      req.flush({ fileId: 'fid', filename: 'f.pdf', mimeType: 'application/pdf' });
    });

    it('should not include targetPlayers when array is empty', () => {
      const file = new File(['x'], 'f.pdf', { type: 'application/pdf' });
      service.uploadAttachment('s1', file, 'Doc', 'all', []).subscribe();

      const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1/attachments`);
      const body = req.request.body as FormData;
      expect(body.has('targetPlayers')).toBe(false);
      req.flush({ fileId: 'fid', filename: 'f.pdf', mimeType: 'application/pdf' });
    });
  });

  describe('updateAttachment()', () => {
    it('should PATCH with name, visibility and targetPlayers', () => {
      service.updateAttachment('s1', 'fid', 'Nuevo nombre', 'staff', ['p1']).subscribe();

      const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1/attachments/fid`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Nuevo nombre', visibility: 'staff', targetPlayers: ['p1'] });
      req.flush({ fileId: 'fid', name: 'Nuevo nombre', filename: 'f.pdf', mimeType: 'application/pdf' });
    });

    it('should send empty targetPlayers array when not provided', () => {
      service.updateAttachment('s1', 'fid', 'Doc', 'all').subscribe();

      const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1/attachments/fid`);
      expect(req.request.body.targetPlayers).toEqual([]);
      req.flush({ fileId: 'fid', filename: 'f.pdf', mimeType: 'application/pdf' });
    });
  });

  describe('deleteAttachment()', () => {
    it('should make DELETE to /:id/attachments/:fileId', () => {
      service.deleteAttachment('s1', 'fid').subscribe();

      const req = httpMock.expectOne(`${API_BASE}/training-sessions/s1/attachments/fid`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
