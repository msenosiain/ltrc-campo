import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PaymentsService } from './payments.service';
import { API_CONFIG_TOKEN } from '../../app.config';
import { PaymentEntityTypeEnum, PaymentTypeEnum } from '@ltrc-campo/shared-api-model';

const BASE = 'http://localhost:3000/api/v1/payments';

describe('PaymentsService (Angular)', () => {
  let service: PaymentsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PaymentsService,
        { provide: API_CONFIG_TOKEN, useValue: { baseUrl: 'http://localhost:3000/api/v1' } },
      ],
    });
    service = TestBed.inject(PaymentsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be defined', () => expect(service).toBeDefined());

  describe('createLink()', () => {
    it('makes POST to /links', () => {
      const payload = { entityType: PaymentEntityTypeEnum.TRIP, entityId: 'id-1', concept: 'Cuota', amount: 500, paymentType: PaymentTypeEnum.FULL, expiresAt: '2025-12-31' } as any;
      service.createLink(payload).subscribe();
      const req = http.expectOne(`${BASE}/links`);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });

  describe('getLinks()', () => {
    it('makes GET with entityType and entityId params', () => {
      service.getLinks(PaymentEntityTypeEnum.TRIP, 'trip-1').subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/links` && r.params.get('entityId') === 'trip-1');
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  describe('cancelLink()', () => {
    it('makes DELETE to /links/:id', () => {
      service.cancelLink('link-1').subscribe();
      const req = http.expectOne(`${BASE}/links/link-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('getConfig()', () => {
    it('makes GET to /config', () => {
      service.getConfig().subscribe();
      const req = http.expectOne(`${BASE}/config`);
      expect(req.request.method).toBe('GET');
      req.flush({ mpFeeRate: 0.05, excludedPaymentTypes: [] });
    });
  });

  describe('updatePaymentConfig()', () => {
    it('makes PATCH to /config', () => {
      service.updatePaymentConfig(['debit_card']).subscribe();
      const req = http.expectOne(`${BASE}/config`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ excludedPaymentTypes: ['debit_card'] });
      req.flush({ excludedPaymentTypes: ['debit_card'] });
    });
  });

  describe('getFeePreview()', () => {
    it('makes GET to /fee-preview with amount', () => {
      service.getFeePreview(1000).subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/fee-preview` && r.params.get('amount') === '1000');
      expect(req.request.method).toBe('GET');
      req.flush({ grossAmount: 1050 });
    });
  });

  describe('getPayments()', () => {
    it('makes GET with entityType and entityId', () => {
      service.getPayments(PaymentEntityTypeEnum.TRIP, 'trip-1').subscribe();
      const req = http.expectOne(r => r.url === BASE && r.params.get('entityId') === 'trip-1');
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  describe('recordManual()', () => {
    it('makes POST to root URL', () => {
      service.recordManual({ entityType: PaymentEntityTypeEnum.TRIP, entityId: 't1', playerId: 'p1', amount: 500, method: 'cash', concept: 'Cuota', date: '2025-01-01' }).subscribe();
      const req = http.expectOne(BASE);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });

  describe('deleteManual()', () => {
    it('makes DELETE to /:id', () => {
      service.deleteManual('pay-1').subscribe();
      const req = http.expectOne(`${BASE}/pay-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('syncPayment()', () => {
    it('makes POST to /:id/sync', () => {
      service.syncPayment('pay-1').subscribe();
      const req = http.expectOne(`${BASE}/pay-1/sync`);
      expect(req.request.method).toBe('POST');
      req.flush({ status: 'approved', updated: true });
    });
  });

  describe('getGlobalReport()', () => {
    it('makes GET to /report/global with filters', () => {
      service.getGlobalReport({ status: 'approved', page: 2, limit: 25 }).subscribe();
      const req = http.expectOne(r =>
        r.url === `${BASE}/report/global` &&
        r.params.get('status') === 'approved' &&
        r.params.get('page') === '2'
      );
      expect(req.request.method).toBe('GET');
      req.flush({ data: [], total: 0, page: 2, limit: 25, totalApproved: 0 });
    });
  });

  describe('getEncounterReport()', () => {
    it('makes GET to /report/encounter with matchIds', () => {
      service.getEncounterReport(['m1', 'm2']).subscribe();
      const req = http.expectOne(r => r.url === `${BASE}/report/encounter` && r.params.get('matchIds') === 'm1,m2');
      expect(req.request.method).toBe('GET');
      req.flush({});
    });
  });

  describe('getPublicLinkInfo()', () => {
    it('makes GET to /public/links/:token', () => {
      service.getPublicLinkInfo('tok-abc').subscribe();
      const req = http.expectOne(`${BASE}/public/links/tok-abc`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });
  });

  describe('validateDni()', () => {
    it('makes POST to /public/links/:token/validate', () => {
      service.validateDni('tok-abc', '12345678').subscribe();
      const req = http.expectOne(`${BASE}/public/links/tok-abc/validate`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ dni: '12345678' });
      req.flush({ playerName: 'Juan' });
    });
  });

  describe('initiateCheckout()', () => {
    it('makes POST to /public/links/:token/checkout', () => {
      service.initiateCheckout('tok-abc', '12345678').subscribe();
      const req = http.expectOne(`${BASE}/public/links/tok-abc/checkout`);
      expect(req.request.method).toBe('POST');
      req.flush({ checkoutUrl: 'https://mp.com' });
    });
  });

  describe('confirmPayment()', () => {
    it('makes POST to /public/confirm', () => {
      service.confirmPayment('ref-1', 'mp-123', 'approved').subscribe();
      const req = http.expectOne(`${BASE}/public/confirm`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toMatchObject({ externalReference: 'ref-1' });
      req.flush({ status: 'approved' });
    });
  });
});
