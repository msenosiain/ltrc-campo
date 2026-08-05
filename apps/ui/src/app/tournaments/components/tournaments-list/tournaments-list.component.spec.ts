import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TournamentsListComponent } from './tournaments-list.component';
import { RouterModule } from '@angular/router';
import { TournamentsService } from '../../services/tournaments.service';
import { BehaviorSubject, of } from 'rxjs';
import { AuthService } from '../../../auth/auth.service';

describe('TournamentsListComponent', () => {
  let component: TournamentsListComponent;
  let fixture: ComponentFixture<TournamentsListComponent>;

  const tournamentsServiceMock = {
    getTournaments: jest.fn().mockReturnValue(of({ total: 0, items: [] })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TournamentsListComponent, RouterModule.forRoot([])],
      providers: [
        { provide: TournamentsService, useValue: tournamentsServiceMock },
        {
          provide: AuthService,
          useValue: { user$: new BehaviorSubject(null).asObservable() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TournamentsListComponent);
    component = fixture.componentInstance;

    component.sort = {
      active: '',
      direction: '',
      sortChange: { subscribe: () => ({ unsubscribe: () => { /* noop */ } }) },
    } as any;

    component.paginator = {
      pageIndex: 0,
      pageSize: 10,
      page: { subscribe: () => ({ unsubscribe: () => { /* noop */ } }) },
    } as any;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
