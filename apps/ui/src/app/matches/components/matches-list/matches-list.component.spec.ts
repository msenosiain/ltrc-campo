import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatchesListComponent } from './matches-list.component';
import { RouterModule, Router } from '@angular/router';
import { MatchesService } from '../../services/matches.service';
import { TournamentsService } from '../../../tournaments/services/tournaments.service';
import { of, Subject } from 'rxjs';
import { Match, MatchStatusEnum } from '@ltrc-campo/shared-api-model';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideNativeDateAdapter } from '@angular/material/core';

describe('MatchesListComponent', () => {
  let component: MatchesListComponent;
  let fixture: ComponentFixture<MatchesListComponent>;
  let routerSpy: jest.SpyInstance;

  const matchesServiceMock = {
    getMatches: jest
      .fn()
      .mockReturnValue(of({ total: 0, items: [], page: 1, size: 10 })),
    getStatusLabel: jest.fn().mockReturnValue('Estado'),
    getTypeLabel: jest.fn().mockReturnValue('Tipo'),
    getFieldOptions: jest.fn().mockReturnValue(of({ opponents: [], venues: [], divisions: [] })),
    patchResult: jest.fn().mockReturnValue(of({})),
    patchStatus: jest.fn().mockReturnValue(of({})),
  } as Partial<MatchesService>;

  const tournamentsServiceMock = {
    getTournaments: jest.fn().mockReturnValue(of([])),
  } as Partial<TournamentsService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [MatchesListComponent, RouterModule.forRoot([]), NoopAnimationsModule],
      providers: [
        provideNativeDateAdapter(),
        { provide: MatchesService, useValue: matchesServiceMock },
        { provide: TournamentsService, useValue: tournamentsServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MatchesListComponent);
    component = fixture.componentInstance;

    component.paginator = {
      pageIndex: 0,
      pageSize: 10,
      page: { subscribe: () => ({ unsubscribe: () => { /* noop */ } }) },
    } as any;
    component.sort = {
      active: '',
      direction: '',
      sortChange: { subscribe: () => ({ unsubscribe: () => { /* noop */ } }) },
    } as any;

    fixture.detectChanges();

    const router = TestBed.inject(Router);
    routerSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('getResultLabel should return em dash when no result', () => {
    const match = { result: undefined, isHome: true } as any;
    expect(component.getResultLabel(match)).toBe('—');
  });

  it('getResultLabel should show result from home perspective', () => {
    const match = {
      result: { homeScore: 2, awayScore: 1 },
      isHome: true,
    } as any;
    expect(component.getResultLabel(match)).toBe('2 - 1');
  });

  it('getResultLabel should show home/away scores', () => {
    const match = {
      result: { homeScore: 2, awayScore: 1 },
      isHome: false,
    } as any;
    expect(component.getResultLabel(match)).toBe('2 - 1');
  });

  it('isCompleted should return true only for completed status', () => {
    expect(component.isCompleted(MatchStatusEnum.COMPLETED)).toBe(true);
    expect(component.isCompleted(MatchStatusEnum.UPCOMING)).toBe(false);
  });

  describe('goToSquad', () => {
    it('should navigate to squad page and stop event propagation', () => {
      const event = { stopPropagation: jest.fn() } as unknown as Event;
      component.goToSquad(event, 'match-42');
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(routerSpy).toHaveBeenCalledWith(['/dashboard/matches', 'match-42', 'squad']);
    });
  });

  describe('changeStatus', () => {
    it('should call patchStatus and show success snackbar', () => {
      const event = { stopPropagation: jest.fn() } as unknown as Event;
      const match = { id: 'match-1' } as Match;

      // Spy on the component's private snackBar instance
      const snackBarSpy = jest.spyOn((component as any).snackBar, 'open');

      component.changeStatus(event, match, MatchStatusEnum.COMPLETED);

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(matchesServiceMock.patchStatus).toHaveBeenCalledWith('match-1', MatchStatusEnum.COMPLETED);
      expect(snackBarSpy).toHaveBeenCalledWith('Estado actualizado', '', { duration: 2500 });
    });

    it('should show error snackbar when patchStatus fails', () => {
      const event = { stopPropagation: jest.fn() } as unknown as Event;
      const match = { id: 'match-1' } as Match;

      const snackBarSpy = jest.spyOn((component as any).snackBar, 'open');
      (matchesServiceMock.patchStatus as jest.Mock).mockReturnValueOnce({
        subscribe: (handlers: any) => handlers.error?.(),
      });

      component.changeStatus(event, match, MatchStatusEnum.CANCELLED);

      expect(snackBarSpy).toHaveBeenCalledWith(
        'Error al actualizar el estado',
        'Cerrar',
        { duration: 3000 }
      );
    });
  });

  describe('openResultDialog', () => {
    it('should open dialog and call patchResult on save', () => {
      const afterClosedSubject = new Subject<any>();
      const dialogSpy = jest.spyOn((component as any).dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);
      const snackBarSpy = jest.spyOn((component as any).snackBar, 'open');

      const event = { stopPropagation: jest.fn() } as unknown as Event;
      const match = { id: 'match-1', result: undefined } as unknown as Match;

      component.openResultDialog(event, match);

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(dialogSpy).toHaveBeenCalled();

      // Simulate dialog close with a result
      afterClosedSubject.next({ homeScore: 2, awayScore: 1 });

      expect(matchesServiceMock.patchResult).toHaveBeenCalledWith('match-1', 2, 1);
      expect(snackBarSpy).toHaveBeenCalledWith('Resultado guardado', '', { duration: 2500 });
    });

    it('should do nothing when dialog is cancelled (null result)', () => {
      const afterClosedSubject = new Subject<any>();
      jest.spyOn((component as any).dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      const event = { stopPropagation: jest.fn() } as unknown as Event;
      const match = { id: 'match-1' } as unknown as Match;

      component.openResultDialog(event, match);

      // Simulate dialog close with null (cancel)
      afterClosedSubject.next(null);

      expect(matchesServiceMock.patchResult).not.toHaveBeenCalled();
    });

    it('should show error snackbar when patchResult fails', () => {
      const afterClosedSubject = new Subject<any>();
      jest.spyOn((component as any).dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);
      const snackBarSpy = jest.spyOn((component as any).snackBar, 'open');

      const event = { stopPropagation: jest.fn() } as unknown as Event;
      const match = { id: 'match-1' } as unknown as Match;

      (matchesServiceMock.patchResult as jest.Mock).mockReturnValueOnce({
        subscribe: (handlers: any) => handlers.error?.(),
      });

      component.openResultDialog(event, match);
      afterClosedSubject.next({ homeScore: 1, awayScore: 0 });

      expect(snackBarSpy).toHaveBeenCalledWith(
        'Error al guardar el resultado',
        'Cerrar',
        { duration: 3000 }
      );
    });
  });
});
