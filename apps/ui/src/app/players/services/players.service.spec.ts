import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PlayersService } from './players.service';
import { API_CONFIG_TOKEN } from '../../app.config';
import { CategoryEnum, PlayerAvailabilityEnum, PlayerStatusEnum, SportEnum } from '@ltrc-campo/shared-api-model';

const BASE = 'http://localhost:3000/api/v1/players';

describe('PlayersService (Angular)', () => {
  let service: PlayersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PlayersService,
        { provide: API_CONFIG_TOKEN, useValue: { baseUrl: 'http://localhost:3000/api/v1' } },
      ],
    });
    service = TestBed.inject(PlayersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be defined', () => expect(service).toBeDefined());

  describe('getPlayers()', () => {
    it('makes GET with pagination params', () => {
      service.getPlayers({ page: 1, size: 20 }).subscribe();
      const req = http.expectOne(r => r.url === BASE && r.params.get('page') === '1');
      expect(req.request.method).toBe('GET');
      req.flush({ items: [], total: 0, page: 1, size: 20 });
    });

    it('makes POST to /filter when playerIds provided', () => {
      service.getPlayers({ page: 1, size: 20, filters: { playerIds: ['id-1'] } as any }).subscribe();
      const req = http.expectOne(`${BASE}/filter`);
      expect(req.request.method).toBe('POST');
      req.flush({ items: [], total: 0, page: 1, size: 20 });
    });
  });

  describe('getPlayerById()', () => {
    it('makes GET to /:id', () => {
      service.getPlayerById('player-1').subscribe();
      const req = http.expectOne(`${BASE}/player-1`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });
  });

  describe('getFieldOptions()', () => {
    it('makes GET to /field-options', () => {
      service.getFieldOptions().subscribe();
      const req = http.expectOne(`${BASE}/field-options`);
      expect(req.request.method).toBe('GET');
      req.flush({ healthInsurances: [] });
    });
  });

  describe('getStats()', () => {
    it('makes GET to /stats', () => {
      service.getStats().subscribe();
      const req = http.expectOne(`${BASE}/stats`);
      expect(req.request.method).toBe('GET');
      req.flush({ byCategory: {}, total: 0 });
    });
  });

  describe('getMyPlayer()', () => {
    it('makes GET to /me', () => {
      service.getMyPlayer().subscribe();
      const req = http.expectOne(`${BASE}/me`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });
  });

  describe('patchCategory()', () => {
    it('makes PATCH to /:id', () => {
      service.patchCategory('p1', CategoryEnum.M15).subscribe();
      const req = http.expectOne(`${BASE}/p1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ category: CategoryEnum.M15 });
      req.flush({});
    });
  });

  describe('patchStatus()', () => {
    it('makes PATCH to /:id with status', () => {
      service.patchStatus('p1', PlayerStatusEnum.INACTIVE).subscribe();
      const req = http.expectOne(`${BASE}/p1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({});
    });
  });

  describe('patchAvailability()', () => {
    it('makes PATCH to /:id/availability', () => {
      service.patchAvailability('p1', PlayerAvailabilityEnum.INJURED, { reason: 'rodilla' }).subscribe();
      const req = http.expectOne(`${BASE}/p1/availability`);
      expect(req.request.method).toBe('PATCH');
      req.flush({});
    });
  });

  describe('deletePlayer()', () => {
    it('makes DELETE to /:id', () => {
      service.deletePlayer('p1').subscribe();
      const req = http.expectOne(`${BASE}/p1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('uploadPlayerPhoto()', () => {
    it('makes POST to /:id/photo', () => {
      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      service.uploadPlayerPhoto('p1', file).subscribe();
      const req = http.expectOne(`${BASE}/p1/photo`);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });

  describe('deletePlayerPhoto()', () => {
    it('makes DELETE to /:id/photo', () => {
      service.deletePlayerPhoto('p1').subscribe();
      const req = http.expectOne(`${BASE}/p1/photo`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('getPlayerPhotoUrl()', () => {
    it('returns the correct photo URL', () => {
      expect(service.getPlayerPhotoUrl('p1')).toBe(`${BASE}/p1/photo`);
    });
  });

  describe('calculatePlayerAge()', () => {
    it('calculates age correctly', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 25);
      expect(service.calculatePlayerAge(birthDate)).toBe(25);
    });
  });
});
