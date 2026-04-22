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
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { getCategoryOptionsBySport, sportOptions, TrainingOption } from '../../training-options';
import { ScheduleFilters } from '../../forms/schedule-form.types';
import { nullToUndefined } from '../../../common/utils/null-to-undefined';
import { UserFilterContextService } from '../../../common/services/user-filter-context.service';

@Component({
  selector: 'ltrc-schedule-search',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './schedule-search.component.html',
  styleUrl: './schedule-search.component.scss',
})
export class ScheduleSearchComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterContext = inject(UserFilterContextService);

  @Input() initialFilters?: Record<string, unknown>;
  @Output() readonly filtersChange = new EventEmitter<ScheduleFilters>();

  filtersExpanded = false;

  readonly activeOptions = [
    { id: true, label: 'Activos' },
    { id: false, label: 'Inactivos' },
  ];

  readonly searchForm = this.fb.group({
    sport: [undefined as SportEnum | undefined],
    category: [undefined as CategoryEnum | undefined],
    isActive: [undefined as boolean | undefined],
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
      this.searchForm.patchValue(this.initialFilters, { emitEvent: false });
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
    this.filtersChange.emit(nullToUndefined(this.searchForm.value) as ScheduleFilters);
  }
}
