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
import {
  CategoryEnum,
  HockeyBranchEnum,
  PlayerAvailabilityEnum,
  PlayerPosition,
  PlayerStatusEnum,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import {
  CategoryOption,
  getCategoryOptionsBySport,
} from '../../../common/category-options';
import {
  getPositionOptionsBySport,
  PositionOption,
} from '../../position-options';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { nullToUndefined } from '../../../common/utils/null-to-undefined';
import { UserFilterContextService } from '../../../common/services/user-filter-context.service';
import { playerAvailabilityOptions, playerStatusOptions } from '../../player-status-options';

@Component({
  selector: 'ltrc-player-search',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './player-search.component.html',
  styleUrls: ['./player-search.component.scss'],
})
export class PlayerSearchComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterContext = inject(UserFilterContextService);

  @Input() initialFilters?: Record<string, unknown>;

  readonly NO_POSITION_SENTINEL = '__no_position__';

  @Output() readonly filtersChange = new EventEmitter<{
    searchTerm?: string;
    sport?: SportEnum;
    position?: PlayerPosition;
    noPosition?: boolean;
    category?: CategoryEnum;
    branch?: HockeyBranchEnum;
    status?: PlayerStatusEnum;
    availability?: PlayerAvailabilityEnum;
  }>();

  positionOptions: PositionOption[] = getPositionOptionsBySport();
  readonly branchOptions = Object.values(HockeyBranchEnum);
  readonly statusOptions = playerStatusOptions;
  readonly availabilityOptions = playerAvailabilityOptions;

  showBranchFilter = false;
  filtersExpanded = false;

  readonly searchForm = this.fb.group({
    searchTerm: [''],
    sport: [undefined as SportEnum | undefined],
    position: [undefined as PlayerPosition | undefined],
    category: [undefined as CategoryEnum | undefined],
    branch: [undefined as HockeyBranchEnum | undefined],
    status: [undefined as PlayerStatusEnum | undefined],
    availability: [undefined as PlayerAvailabilityEnum | undefined],
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
        if (ctx.forcedSport) {
          this.searchForm.get('sport')!.setValue(ctx.forcedSport, { emitEvent: false });
          this.positionOptions = getPositionOptionsBySport(ctx.forcedSport);
          this.showBranchFilter = ctx.forcedSport === SportEnum.HOCKEY;
        }
        if (ctx.forcedCategory) {
          this.searchForm.get('category')!.setValue(ctx.forcedCategory, { emitEvent: false });
        }
      });

    this.searchForm.get('sport')!.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sport) => {
        this.positionOptions = getPositionOptionsBySport(sport);
        this.showBranchFilter = sport === SportEnum.HOCKEY;

        const cat = this.searchForm.get('category')?.value;
        if (cat && !this.availableCategories().some(c => c.id === cat)) {
          this.searchForm.get('category')?.setValue(undefined, { emitEvent: false });
        }
        const pos = this.searchForm.get('position')?.value;
        if (pos && !this.positionOptions.find(p => p.id === pos)) {
          this.searchForm.get('position')?.setValue(undefined, { emitEvent: false });
        }
        if (!this.showBranchFilter) {
          this.searchForm.get('branch')?.setValue(undefined, { emitEvent: false });
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
    const raw = nullToUndefined(this.searchForm.value);
    if ((raw.position as unknown as string) === this.NO_POSITION_SENTINEL) {
      const { position, ...rest } = raw as any;
      this.filtersChange.emit({ ...rest, noPosition: true });
    } else {
      this.filtersChange.emit(raw);
    }
  }
}
