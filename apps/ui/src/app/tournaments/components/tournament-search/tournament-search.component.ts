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
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { nullToUndefined } from '../../../common/utils/null-to-undefined';
import { UserFilterContextService } from '../../../common/services/user-filter-context.service';
import { CategoryOption, getCategoryOptionsBySport } from '../../../common/category-options';

@Component({
  selector: 'ltrc-tournament-search',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
  ],
  templateUrl: './tournament-search.component.html',
  styleUrl: './tournament-search.component.scss',
})
export class TournamentSearchComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterContext = inject(UserFilterContextService);

  @Input() initialFilters?: Record<string, unknown>;

  @Output() readonly filtersChange = new EventEmitter<{
    searchTerm?: string;
    sport?: SportEnum;
    categories?: CategoryEnum[];
  }>();

  filtersExpanded = false;

  readonly searchForm = this.fb.group({
    searchTerm: [''],
    sport: [undefined as SportEnum | undefined],
    categories: [[] as CategoryEnum[]],
  });

  private readonly selectedSport = toSignal(
    this.searchForm.get('sport')!.valueChanges.pipe(startWith(this.searchForm.get('sport')!.value as SportEnum | undefined))
  );

  readonly availableSports = computed(() => this.filterContext.filterContext().sportOptions);

  readonly availableCategories = computed((): CategoryOption[] => {
    const sport = this.selectedSport();
    const ctxCats = this.filterContext.filterContext().categoryOptions;
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
      });

    this.searchForm.get('sport')!.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const currentCats = this.searchForm.get('categories')!.value as CategoryEnum[];
        const validIds = new Set(this.availableCategories().map(c => c.id));
        const filtered = currentCats.filter(c => validIds.has(c));
        if (filtered.length !== currentCats.length) {
          this.searchForm.get('categories')!.setValue(filtered, { emitEvent: false });
        }
      });

    this.searchForm.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.emitFilters());
  }

  clearSearch(): void {
    this.searchForm.get('searchTerm')?.setValue('');
  }

  clearField(field: string): void {
    this.searchForm.get(field)?.setValue(field === 'categories' ? [] : undefined);
  }

  private emitFilters(): void {
    this.filtersChange.emit(nullToUndefined(this.searchForm.value));
  }
}
