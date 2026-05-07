import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PlayerFeesPublicService } from './player-fees.service';
import { API_CONFIG_TOKEN } from '../../app.config';

const BASE = 'http://localhost:3000/api/v1/player-fees/public';

describe('PlayerFeesPublicService', () => {
  let service: PlayerFeesPublicService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PlayerFeesPublicService,
        { provide: API_CONFIG_TOKEN, useValue: { baseUrl: 'http://localhost:3000/api/v1' } },
      ],
    });
    service = TestBed.inject(PlayerFeesPublicService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be defined', () => expect(service).toBeDefined());

  it('getPublicInfo() makes GET to /public/:token', () => {
    service.getPublicInfo('tok-1').subscribe();
    const req = http.expectOne(`${BASE}/tok-1`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('validateDni() makes POST to /public/:token/validate', () => {
    service.validateDni('tok-1', '12345678').subscribe();
    const req = http.expectOne(`${BASE}/tok-1/validate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ dni: '12345678' });
    req.flush({ playerName: 'Juan' });
  });

  it('initiateCheckout() makes POST to /public/:token/checkout', () => {
    service.initiateCheckout('tok-1', '12345678').subscribe();
    const req = http.expectOne(`${BASE}/tok-1/checkout`);
    expect(req.request.method).toBe('POST');
    req.flush({ checkoutUrl: 'https://mp.com' });
  });

  it('confirmPayment() makes POST to /public/confirm', () => {
    service.confirmPayment('ref-1', 'mp-123', 'approved').subscribe();
    const req = http.expectOne('http://localhost:3000/api/v1/player-fees/public/confirm');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({ externalReference: 'ref-1' });
    req.flush({ status: 'approved' });
  });
});
