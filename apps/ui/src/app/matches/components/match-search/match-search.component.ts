import {
  Component,
  computed,
  DestroyRef,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, map } from 'rxjs/operators';
import { forkJoin, startWith } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { format } from 'date-fns';
import {
  CategoryEnum,
  MatchStatusEnum,
  SportEnum,
  Tournament,
} from '@ltrc-campo/shared-api-model';
import {
  getCategoryOptionsBySport,
  matchStatusOptions,
  MatchOption,
} from '../../match-options';
import { MatchFilters } from '../../forms/match-form.types';
import { nullToUndefined } from '../../../common/utils/null-to-undefined';
import { TournamentsService } from '../../../tournaments/services/tournaments.service';
import { MatchesService } from '../../services/matches.service';
import { UserFilterContextService } from '../../../common/services/user-filter-context.service';

@Component({
  selector: 'ltrc-match-search',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './match-search.component.html',
  styleUrl: './match-search.component.scss',
})
export class MatchSearchComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly matchesService = inject(MatchesService);
  private readonly filterContext = inject(UserFilterContextService);

  @Input() initialFilters?: Record<string, unknown>;

  @Output() readonly filtersChange = new EventEmitter<MatchFilters>();

  readonly statusOptions = matchStatusOptions;
  tournaments: Tournament[] = [];
  allTournaments: Tournament[] = [];
  opponents: string[] = [];
  divisions: string[] = [];
  filtersExpanded = false;

  readonly searchForm = this.fb.group({
    status: [undefined as MatchStatusEnum | undefined],
    sport: [undefined as SportEnum | undefined],
    category: [undefined as CategoryEnum | undefined],
    division: [undefined as string | undefined],
    opponent: [undefined as string | undefined],
    tournament: [undefined as string | undefined],
    fromDate: [null as Date | null],
    toDate: [null as Date | null],
  });

  private readonly selectedSport = toSignal(
    this.searchForm.get('sport')!.valueChanges.pipe(startWith(this.searchForm.get('sport')!.value as SportEnum | undefined))
  );

  readonly availableSports = computed(() => this.filterContext.filterContext().sportOptions);

  readonly availableCategories = computed((): MatchOption<CategoryEnum>[] => {
    const sport = this.selectedSport();
    const ctxCats = this.filterContext.filterContext().categoryOptions as MatchOption<CategoryEnum>[];
    if (!sport) return ctxCats;
    const forSport = getCategoryOptionsBySport(sport);
    return ctxCats.filter(c => forSport.some(o => o.id === c.id));
  });

  ngOnInit(): void {
    if (this.initialFilters) {
      const { fromDate, toDate, ...rest } = this.initialFilters as MatchFilters;
      this.searchForm.patchValue({
        ...rest,
        fromDate: fromDate ? new Date(fromDate + 'T12:00:00Z') : null,
        toDate: toDate ? new Date(toDate + 'T12:00:00Z') : null,
      }, { emitEvent: false });
    }

    forkJoin({
      allTournaments: this.tournamentsService.getTournaments({ page: 1, size: 1000 }).pipe(map(res => res.items)),
      fieldOptions: this.matchesService.getFieldOptions(),
    }).subscribe(({ allTournaments, fieldOptions }) => {
      this.allTournaments = allTournaments;
      this.opponents = fieldOptions.opponents.sort();
      if (this.searchForm.get('category')?.value) {
        this.divisions = fieldOptions.divisions.sort();
      }
      this.tournaments = fieldOptions.tournamentIds
        ? allTournaments.filter(t => fieldOptions.tournamentIds!.includes(t.id!))
        : allTournaments;
    });

    this.filterContext.filterContext$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ctx) => {
        if (ctx.forcedSport) this.searchForm.get('sport')!.setValue(ctx.forcedSport, { emitEvent: false });
        if (ctx.forcedCategory) this.searchForm.get('category')!.setValue(ctx.forcedCategory, { emitEvent: false });
        const currentSport = ctx.forcedSport ?? this.searchForm.get('sport')!.value;
        // Validate current category after context load
        const currentCat = this.searchForm.get('category')!.value;
        if (currentCat) {
          const allForSport = getCategoryOptionsBySport(currentSport);
          const ctxCatIds = new Set(ctx.categoryOptions.map(c => c.id));
          if (!allForSport.some(c => c.id === currentCat) || !ctxCatIds.has(currentCat)) {
            this.searchForm.get('category')!.setValue(undefined, { emitEvent: false });
          }
        }
      });

    this.searchForm.get('sport')!.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const currentCategory = this.searchForm.get('category')!.value;
        if (currentCategory && !this.availableCategories().some(c => c.id === currentCategory)) {
          this.searchForm.get('category')!.setValue(undefined, { emitEvent: false });
          this.searchForm.get('division')!.setValue(undefined, { emitEvent: false });
        }
      });

    this.searchForm.get('category')!.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((category) => {
        this.searchForm.get('division')!.setValue(undefined, { emitEvent: false });
        this.matchesService.getFieldOptions(category ?? undefined).subscribe(opts => {
          this.divisions = opts.divisions.sort();
        });
      });

    this.searchForm.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.emitFilters());

    // Apply category filter for any pre-filled sport from initialFilters
    const initialSport = this.searchForm.get('sport')!.value;
    if (initialSport) {
      const currentCat = this.searchForm.get('category')!.value;
      if (currentCat && !getCategoryOptionsBySport(initialSport).some(c => c.id === currentCat)) {
        this.searchForm.get('category')!.setValue(undefined, { emitEvent: false });
      }
    }
  }

  clearField(field: string): void {
    const isDate = field === 'fromDate' || field === 'toDate';
    this.searchForm.get(field)?.setValue(isDate ? null : undefined);
  }

  private emitFilters(): void {
    const v = this.searchForm.value;
    const filters: MatchFilters = {
      ...(nullToUndefined(v) as MatchFilters),
      fromDate: v.fromDate ? format(v.fromDate, 'yyyy-MM-dd') : undefined,
      toDate: v.toDate ? format(v.toDate, 'yyyy-MM-dd') : undefined,
    };
    this.filtersChange.emit(filters);
  }
}
