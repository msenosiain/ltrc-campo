import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayersListComponent } from './players-list.component';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { PlayersService } from '../../services/players.service';
import { of } from 'rxjs';
import { ListStateService } from '../../../common/services/list-state.service';
import { SortOrder, SportEnum } from '@ltrc-campo/shared-api-model';
import { API_CONFIG_TOKEN } from '../../../app.config';

describe('PlayersList', () => {
  let component: PlayersListComponent;
  let fixture: ComponentFixture<PlayersListComponent>;
  let listStateService: ListStateService;

  const playersServiceMock = {
    getPositionLabel: jest.fn().mockReturnValue('Position'),
    getPlayerPhotoUrl: jest.fn().mockReturnValue(''),
    getPlayers: jest.fn().mockReturnValue(of({ total: 0, items: [] })),
  } as Partial<PlayersService>;

  const stubPaginatorAndSort = (comp: PlayersListComponent) => {
    comp.paginator = {
      pageIndex: 0,
      pageSize: 10,
      page: { subscribe: () => ({ unsubscribe: () => {} }) },
    } as any;
    comp.sort = {
      active: '',
      direction: '',
      sortChange: { subscribe: () => ({ unsubscribe: () => {} }) },
    } as any;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayersListComponent, RouterModule.forRoot([])],
      providers: [
        { provide: PlayersService, useValue: playersServiceMock },
        { provide: API_CONFIG_TOKEN, useValue: { baseUrl: 'http://localhost:3000/api/v1' } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: {}, paramMap: { get: () => null } },
        },
      ],
    }).compileComponents();

    listStateService = TestBed.inject(ListStateService);
    listStateService.clear('players');

    fixture = TestBed.createComponent(PlayersListComponent);
    component = fixture.componentInstance;
    stubPaginatorAndSort(component);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ListState integration', () => {
    it('should save state on applyFilters', () => {
      const filters = { searchTerm: 'test', sport: SportEnum.HOCKEY };
      component.applyFilters(filters);

      const saved = listStateService.get('players');
      expect(saved).toBeDefined();
      expect(saved!.filters).toEqual(filters);
      expect(saved!.pageIndex).toBe(0);
    });

    it('should save state on destroy', () => {
      component.applyFilters({ searchTerm: 'before destroy' });
      component.ngOnDestroy();

      const saved = listStateService.get('players');
      expect(saved).toBeDefined();
      expect(saved!.filters).toEqual({ searchTerm: 'before destroy' });
    });

    it('should restore saved filters on init', () => {
      listStateService.save('players', {
        filters: { searchTerm: 'restored' },
        pageIndex: 2,
        pageSize: 20,
        sortBy: 'name',
        sortOrder: SortOrder.ASC,
      });

      const fixture2 = TestBed.createComponent(PlayersListComponent);
      const component2 = fixture2.componentInstance;

      expect(component2.savedState).toBeDefined();
      expect(component2.savedState!.filters).toEqual({ searchTerm: 'restored' });
      expect(component2.savedState!.pageIndex).toBe(2);
      expect(component2.savedState!.sortBy).toBe('name');
    });
  });
});
