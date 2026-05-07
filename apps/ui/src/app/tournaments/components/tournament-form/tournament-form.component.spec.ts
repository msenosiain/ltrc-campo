import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TournamentFormComponent } from './tournament-form.component';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { UserFilterContextService } from '../../../common/services/user-filter-context.service';
import { TournamentsService } from '../../services/tournaments.service';
import { API_CONFIG_TOKEN } from '../../../app.config';
import { of, Subject } from 'rxjs';
import { FilterContext } from '../../../common/services/user-filter-context.service';
import { SportEnum } from '@ltrc-campo/shared-api-model';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

const mockFilterContext: FilterContext = {
  forcedSport: null,
  forcedCategory: null,
  sportOptions: [],
  categoryOptions: [],
};

const mockUserFilterContextService = {
  filterContext$: new Subject<FilterContext>(),
};

const mockTournamentsService = {
  uploadLogo: jest.fn().mockReturnValue(of({})),
  deleteLogo: jest.fn().mockReturnValue(of({})),
  getLogoUrl: jest.fn().mockReturnValue(''),
};

describe('TournamentFormComponent', () => {
  let component: TournamentFormComponent;
  let fixture: ComponentFixture<TournamentFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TournamentFormComponent, HttpClientTestingModule, NoopAnimationsModule],
      providers: [
        { provide: API_CONFIG_TOKEN, useValue: { baseUrl: 'http://localhost:3000/api/v1' } },
        { provide: UserFilterContextService, useValue: mockUserFilterContextService },
        { provide: TournamentsService, useValue: mockTournamentsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TournamentFormComponent);
    component = fixture.componentInstance;
    mockUserFilterContextService.filterContext$.next(mockFilterContext);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have name as required field', () => {
    const nameControl = component.tournamentForm.get('name');
    expect(nameControl?.valid).toBeFalsy();
    nameControl?.setValue('Copa 2024');
    expect(nameControl?.valid).toBeTruthy();
  });

  it('should patch form when tournament input changes', () => {
    component.tournament = { name: 'Copa 2024', season: '2024' } as any;
    component.ngOnChanges({ tournament: {} as any });
    expect(component.tournamentForm.get('name')?.value).toBe('Copa 2024');
    expect(component.tournamentForm.get('season')?.value).toBe('2024');
  });

  it('should not emit when form is invalid', () => {
    const emitSpy = jest.spyOn(component.formSubmit, 'emit');
    component.onSubmit();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should emit formSubmit when form is valid', () => {
    const emitSpy = jest.spyOn(component.formSubmit, 'emit');
    component.tournamentForm.setValue({
      name: 'Copa 2024',
      season: '2024',
      description: '',
      sport: null,
      categories: [],
      type: null,
    });
    component.onSubmit();
    expect(emitSpy).toHaveBeenCalledWith({
      name: 'Copa 2024',
      season: '2024',
      description: '',
      sport: null,
      categories: [],
      type: null,
    });
  });

  it('should emit cancel', () => {
    const emitSpy = jest.spyOn(component.cancel, 'emit');
    component.onCancel();
    expect(emitSpy).toHaveBeenCalled();
  });
});
