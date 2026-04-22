import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatchFormComponent } from './match-form.component';
import { TournamentsService } from '../../../tournaments/services/tournaments.service';
import { MatchesService } from '../../services/matches.service';
import { PaymentsService } from '../../../payments/services/payments.service';
import { API_CONFIG_TOKEN } from '../../../app.config';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { CategoryEnum, MatchStatusEnum, SportEnum } from '@ltrc-campo/shared-api-model';

describe('MatchFormComponent', () => {
  let component: MatchFormComponent;
  let fixture: ComponentFixture<MatchFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatchFormComponent],
      providers: [
        provideNativeDateAdapter(),
        {
          provide: TournamentsService,
          useValue: {
            getTournaments: jest
              .fn()
              .mockReturnValue(of({ items: [], total: 0, page: 1, size: 1000 })),
          },
        },
        {
          provide: MatchesService,
          useValue: {
            getFieldOptions: jest
              .fn()
              .mockReturnValue(
                of({ opponents: [], venues: [], divisions: [] })
              ),
          },
        },
        {
          provide: PaymentsService,
          useValue: {
            getConfig: jest.fn().mockReturnValue(of({ mpFeeRate: 0.0483 })),
          },
        },
        { provide: API_CONFIG_TOKEN, useValue: { baseUrl: 'http://localhost:3000/api/v1' } },
        provideHttpClient(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MatchFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should require date, venue, tournament and category', () => {
    expect(component.matchForm.valid).toBeFalsy();
    component.matchForm.patchValue({
      date: new Date(),
      venue: 'El Monumental',
      tournament: '507f1f77bcf86cd799439011',
      sport: SportEnum.RUGBY,
      category: CategoryEnum.PLANTEL_SUPERIOR,
    });
    expect(component.matchForm.valid).toBeTruthy();
  });

  it('should not emit when form is invalid', () => {
    const spy = jest.spyOn(component.formSubmit, 'emit');
    component.onSubmit();
    expect(spy).not.toHaveBeenCalled();
  });

  it('should emit formSubmit when form is valid', () => {
    const spy = jest.spyOn(component.formSubmit, 'emit');
    component.matchForm.patchValue({
      date: new Date(),
      venue: 'El Monumental',
      tournament: '507f1f77bcf86cd799439011',
      sport: SportEnum.RUGBY,
      categories: [CategoryEnum.M14],
      status: MatchStatusEnum.UPCOMING,
      isHome: true,
    });
    component.timeControl.setValue('15:00');
    component.onSubmit();
    expect(spy).toHaveBeenCalled();
  });

  it('should emit cancel', () => {
    const spy = jest.spyOn(component.cancel, 'emit');
    component.onCancel();
    expect(spy).toHaveBeenCalled();
  });
});
