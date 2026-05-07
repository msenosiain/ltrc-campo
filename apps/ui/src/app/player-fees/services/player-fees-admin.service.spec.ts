import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PlayerFeesAdminService } from './player-fees-admin.service';
import { API_CONFIG_TOKEN } from '../../app.config';
import { SportEnum } from '@ltrc-campo/shared-api-model';

const BASE = 'http://localhost:3000/api/v1/player-fees';

describe('PlayerFeesAdminService', () => {
  let service: PlayerFeesAdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PlayerFeesAdminService,
        { provide: API_CONFIG_TOKEN, useValue: { baseUrl: 'http://localhost:3000/api/v1' } },
      ],
    });
    service = TestBed.inject(PlayerFeesAdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be defined', () => expect(service).toBeDefined());

  it('getPlayerStatus() makes GET to /player-status/:id', () => {
    service.getPlayerStatus('p1', '2025').subscribe();
    const req = http.expectOne(r => r.url === `${BASE}/player-status/p1`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getStatus() makes GET to /status with params', () => {
    service.getStatus('2025', SportEnum.RUGBY).subscribe();
    const req = http.expectOne(r => r.url === `${BASE}/status`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getStats() makes GET to /stats', () => {
    service.getStats('2025', SportEnum.RUGBY).subscribe();
    const req = http.expectOne(r => r.url === `${BASE}/stats`);
    expect(req.request.method).toBe('GET');
    req.flush({ total: 0, paid: 0, eligible: 0, byCategory: {} });
  });

  it('recordManualPayment() makes POST to /manual-payment', () => {
    service.recordManualPayment({ playerId: 'p1', season: '2025', sport: SportEnum.RUGBY, method: 'cash' } as any).subscribe();
    const req = http.expectOne(`${BASE}/manual-payment`);
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });

  it('updateSeasonRecord() makes PATCH to /season-record/:id', () => {
    service.updateSeasonRecord('p1', { season: '2025', sport: SportEnum.RUGBY, membershipCurrent: true }).subscribe();
    const req = http.expectOne(`${BASE}/season-record/p1`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('getConfigs() makes GET to /config', () => {
    service.getConfigs().subscribe();
    const req = http.expectOne(`${BASE}/config`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createConfig() makes POST to /config', () => {
    service.createConfig({ season: '2025', sport: SportEnum.RUGBY, feeType: 'rugby', label: 'Test', addMpFee: false, familyDiscount: false, blocks: [] }).subscribe();
    const req = http.expectOne(`${BASE}/config`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('updateConfig() makes PATCH to /config/:id', () => {
    service.updateConfig('cfg-1', { label: 'Updated' }).subscribe();
    const req = http.expectOne(`${BASE}/config/cfg-1`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('activateConfig() makes POST to /config/:id/activate', () => {
    service.activateConfig('cfg-1').subscribe();
    const req = http.expectOne(`${BASE}/config/cfg-1/activate`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('deactivateConfig() makes POST to /config/:id/deactivate', () => {
    service.deactivateConfig('cfg-1').subscribe();
    const req = http.expectOne(`${BASE}/config/cfg-1/deactivate`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('deleteConfig() makes DELETE to /config/:id', () => {
    service.deleteConfig('cfg-1').subscribe();
    const req = http.expectOne(`${BASE}/config/cfg-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getFamilies() makes GET to /families', () => {
    service.getFamilies().subscribe();
    const req = http.expectOne(`${BASE}/families`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createFamily() makes POST to /families', () => {
    service.createFamily({ name: 'Los García', sport: SportEnum.RUGBY, members: [] }).subscribe();
    const req = http.expectOne(`${BASE}/families`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('deleteFamily() makes DELETE to /families/:id', () => {
    service.deleteFamily('fam-1').subscribe();
    const req = http.expectOne(`${BASE}/families/fam-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
