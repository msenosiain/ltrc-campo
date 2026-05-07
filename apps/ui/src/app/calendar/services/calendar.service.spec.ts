import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CalendarService } from './calendar.service';
import { API_CONFIG_TOKEN } from '../../app.config';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';

const BASE = 'http://localhost:3000/api/v1/calendar';

describe('CalendarService', () => {
  let service: CalendarService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        CalendarService,
        { provide: API_CONFIG_TOKEN, useValue: { baseUrl: 'http://localhost:3000/api/v1' } },
      ],
    });
    service = TestBed.inject(CalendarService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be defined', () => expect(service).toBeDefined());

  it('getEvents() makes GET with fromDate and toDate', () => {
    service.getEvents('2025-06-01', '2025-06-07').subscribe();
    const req = http.expectOne(r =>
      r.url === BASE &&
      r.params.get('fromDate') === '2025-06-01' &&
      r.params.get('toDate') === '2025-06-07'
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getEvents() includes sport and category params when provided', () => {
    service.getEvents('2025-06-01', '2025-06-07', SportEnum.RUGBY, CategoryEnum.PLANTEL_SUPERIOR).subscribe();
    const req = http.expectOne(r =>
      r.url === BASE &&
      r.params.get('sport') === SportEnum.RUGBY &&
      r.params.get('category') === CategoryEnum.PLANTEL_SUPERIOR
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getEvents() omits sport and category when not provided', () => {
    service.getEvents('2025-06-01', '2025-06-07').subscribe();
    const req = http.expectOne(r => r.url === BASE);
    expect(req.request.params.has('sport')).toBe(false);
    expect(req.request.params.has('category')).toBe(false);
    req.flush([]);
  });
});
