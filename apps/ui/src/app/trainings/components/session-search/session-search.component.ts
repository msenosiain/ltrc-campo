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
import { debounceTime } from 'rxjs/operators';
import { startWith } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { format } from 'date-fns';
import {
  CategoryEnum,
  SportEnum,
  TrainingSessionStatusEnum,
  TrainingSessionFilters,
} from '@ltrc-campo/shared-api-model';
import { getCategoryOptionsBySport, sessionStatusOptions, TrainingOption } from '../../training-options';
import { nullToUndefined } from '../../../common/utils/null-to-undefined';
import { UserFilterContextService } from '../../../common/services/user-filter-context.service';

@Component({
  selector: 'ltrc-session-search',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './session-search.component.html',
  styleUrl: './session-search.component.scss',
})
export class SessionSearchComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterContext = inject(UserFilterContextService);

  @Input() initialFilters?: Record<string, unknown>;
  @Output() readonly filtersChange = new EventEmitter<TrainingSessionFilters>();

  readonly statusOptions = sessionStatusOptions;
  filtersExpanded = false;

  readonly searchForm = this.fb.group({
    sport: [undefined as SportEnum | undefined],
    category: [undefined as CategoryEnum | undefined],
    status: [undefined as TrainingSessionStatusEnum | undefined],
    fromDate: [null as Date | null],
    toDate: [null as Date | null],
    location: [undefined as string | undefined],
  });

  private readonly selectedSport = toSignal(
    this.searchForm.get('sport')!.valueChanges.pipe(startWith(this.searchForm.get('sport')!.value as SportEnum | undefined))
  );

  readonly availableSports = computed(() => this.filterContext.filterContext().sportOptions);

  readonly availableCategories = computed((): TrainingOption<CategoryEnum>[] => {
    const sport = this.selectedSport();
    const ctxCats = this.filterContext.filterContext().categoryOptions as TrainingOption<CategoryEnum>[];
    if (!sport) return ctxCats;
    const forSport = getCategoryOptionsBySport(sport);
    return ctxCats.filter(c => forSport.some(o => o.id === c.id));
  });

  ngOnInit(): void {
    if (this.initialFilters) {
      const { fromDate, toDate, ...rest } = this
        .initialFilters as TrainingSessionFilters;
      this.searchForm.patchValue(
        {
          ...rest,
          fromDate: fromDate ? new Date(fromDate + 'T12:00:00Z') : null,
          toDate: toDate ? new Date(toDate + 'T12:00:00Z') : null,
        },
        { emitEvent: false }
      );
    }

    this.filterContext.filterContext$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ctx) => {
        if (ctx.forcedSport) this.searchForm.get('sport')!.setValue(ctx.forcedSport, { emitEvent: false });
        if (ctx.forcedCategory) this.searchForm.get('category')!.setValue(ctx.forcedCategory, { emitEvent: false });
        this.emitFilters();
      });

    this.searchForm.get('sport')!.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const currentCategory = this.searchForm.get('category')!.value;
        if (currentCategory && !this.availableCategories().some(c => c.id === currentCategory)) {
          this.searchForm.get('category')!.setValue(undefined, { emitEvent: false });
        }
      });

    this.searchForm.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.emitFilters());
  }

  clearField(field: string): void {
    this.searchForm.get(field)?.setValue(undefined);
  }

  private emitFilters(): void {
    const v = this.searchForm.value;
    const filters: TrainingSessionFilters = {
      ...(nullToUndefined(v) as TrainingSessionFilters),
      fromDate: v.fromDate ? format(v.fromDate, 'yyyy-MM-dd') : undefined,
      toDate: v.toDate ? format(v.toDate, 'yyyy-MM-dd') : undefined,
    };
    this.filtersChange.emit(filters);
  }
}
