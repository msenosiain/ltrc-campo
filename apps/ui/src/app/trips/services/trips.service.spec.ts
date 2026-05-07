import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TripsService } from './trips.service';
import { API_CONFIG_TOKEN } from '../../app.config';
import { TripParticipantStatusEnum, TripParticipantTypeEnum, TripStatusEnum, TransportTypeEnum } from '@ltrc-campo/shared-api-model';

const BASE = 'http://localhost:3000/api/v1/trips';

describe('TripsService (Angular)', () => {
  let service: TripsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        TripsService,
        { provide: API_CONFIG_TOKEN, useValue: { baseUrl: 'http://localhost:3000/api/v1' } },
      ],
    });
    service = TestBed.inject(TripsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be defined', () => expect(service).toBeDefined());

  describe('getTrips()', () => {
    it('makes GET with pagination params', () => {
      service.getTrips({ page: 1, size: 10 }).subscribe();
      const req = http.expectOne(r => r.url === BASE && r.params.get('page') === '1');
      expect(req.request.method).toBe('GET');
      req.flush({ items: [], total: 0, page: 1, size: 10 });
    });
  });

  describe('getTripById()', () => {
    it('makes GET to /:id', () => {
      service.getTripById('trip-1').subscribe();
      const req = http.expectOne(`${BASE}/trip-1`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });
  });

  describe('createTrip()', () => {
    it('makes POST to /trips', () => {
      service.createTrip({ name: 'Viaje', destination: 'Mendoza', departureDate: '2025-06-01', costPerPerson: 500 }).subscribe();
      const req = http.expectOne(BASE);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });

  describe('updateTrip()', () => {
    it('makes PATCH to /:id', () => {
      service.updateTrip('trip-1', { name: 'Nuevo nombre' }).subscribe();
      const req = http.expectOne(`${BASE}/trip-1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({});
    });
  });

  describe('deleteTrip()', () => {
    it('makes DELETE to /:id', () => {
      service.deleteTrip('trip-1').subscribe();
      const req = http.expectOne(`${BASE}/trip-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('addParticipant()', () => {
    it('makes POST to /:id/participants', () => {
      service.addParticipant('trip-1', { type: TripParticipantTypeEnum.PLAYER, playerId: 'p1' }).subscribe();
      const req = http.expectOne(`${BASE}/trip-1/participants`);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });

  describe('bulkAddParticipants()', () => {
    it('makes POST to /:id/participants/bulk', () => {
      service.bulkAddParticipants('trip-1', []).subscribe();
      const req = http.expectOne(`${BASE}/trip-1/participants/bulk`);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });

  describe('updateParticipant()', () => {
    it('makes PATCH to /:id/participants/:pid', () => {
      service.updateParticipant('trip-1', 'pid-1', { status: TripParticipantStatusEnum.CONFIRMED }).subscribe();
      const req = http.expectOne(`${BASE}/trip-1/participants/pid-1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({});
    });
  });

  describe('removeParticipant()', () => {
    it('makes DELETE to /:id/participants/:pid', () => {
      service.removeParticipant('trip-1', 'pid-1').subscribe();
      const req = http.expectOne(`${BASE}/trip-1/participants/pid-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('recordPayment()', () => {
    it('makes POST to /:id/participants/:pid/payments', () => {
      service.recordPayment('trip-1', 'pid-1', { amount: 500, date: '2025-01-01' }).subscribe();
      const req = http.expectOne(`${BASE}/trip-1/participants/pid-1/payments`);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });

  describe('removePayment()', () => {
    it('makes DELETE to /:id/participants/:pid/payments/:payid', () => {
      service.removePayment('trip-1', 'pid-1', 'pay-1').subscribe();
      const req = http.expectOne(`${BASE}/trip-1/participants/pid-1/payments/pay-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('addTransport()', () => {
    it('makes POST to /:id/transports', () => {
      service.addTransport('trip-1', { name: 'Bus', type: TransportTypeEnum.BUS, capacity: 40 }).subscribe();
      const req = http.expectOne(`${BASE}/trip-1/transports`);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });

  describe('removeTransport()', () => {
    it('makes DELETE to /:id/transports/:tid', () => {
      service.removeTransport('trip-1', 'tr-1').subscribe();
      const req = http.expectOne(`${BASE}/trip-1/transports/tr-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });
});
