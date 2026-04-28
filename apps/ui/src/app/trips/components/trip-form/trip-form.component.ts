import {
  Component,
  DestroyRef,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import {
  CategoryEnum,
  SportEnum,
  Trip,
  TripStatusEnum,
} from '@ltrc-campo/shared-api-model';
import { format } from 'date-fns';
import { DATE_FORMAT } from '@ltrc-campo/shared-api-model';
import { SportOption, sportOptions } from '../../../common/sport-options';
import {
  CategoryOption,
  getCategoryOptionsBySport,
} from '../../../common/category-options';
import {
  TripOption,
  tripStatusOptions,
} from '../../trip-options';
import { CreateTripPayload } from '../../services/trips.service';
import {
  FilterContext,
  UserFilterContextService,
} from '../../../common/services/user-filter-context.service';

@Component({
  selector: 'ltrc-trip-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  templateUrl: './trip-form.component.html',
  styleUrl: './trip-form.component.scss',
})
export class TripFormComponent implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly userFilterContext = inject(UserFilterContextService);

  @Input() trip?: Trip;
  @Input() submitting = false;

  @Output() readonly formSubmit = new EventEmitter<CreateTripPayload>();
  @Output() readonly cancel = new EventEmitter<void>();

  sportOptions: SportOption[] = sportOptions;
  readonly statusOptions: TripOption<TripStatusEnum>[] = tripStatusOptions;
  categoryOptions: CategoryOption[] = getCategoryOptionsBySport();
  private filterCtx?: FilterContext;

  form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    destination: ['', Validators.required],
    sport: [null as SportEnum | null],
    categories: [[] as CategoryEnum[]],
    departureDate: [null, Validators.required],
    returnDate: [null],
    registrationDeadline: [null],
    costPerPerson: [0, [Validators.required, Validators.min(0)]],
    status: [TripStatusEnum.DRAFT],
    description: [''],
  });

  ngOnInit(): void {
    this.userFilterContext.filterContext$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ctx) => this.applyFilterContext(ctx));

    this.form
      .get('sport')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sport: SportEnum | null) => {
        this.updateCategoryOptions(sport);
      });
  }

  private applyFilterContext(ctx: FilterContext): void {
    this.filterCtx = ctx;
    this.sportOptions = ctx.sportOptions;

    if (!this.trip) {
      const patch: Record<string, unknown> = {};
      if (ctx.forcedSport) patch['sport'] = ctx.forcedSport;
      if (ctx.forcedCategory) patch['categories'] = [ctx.forcedCategory];
      if (Object.keys(patch).length) this.form.patchValue(patch);
    }

    this.updateCategoryOptions(this.form.get('sport')?.value);
  }

  private updateCategoryOptions(sport: SportEnum | null): void {
    const allOptions = getCategoryOptionsBySport(sport);
    if (this.filterCtx?.categoryOptions.length) {
      const allowed = new Set(this.filterCtx.categoryOptions.map((c) => c.id));
      this.categoryOptions = allOptions.filter((o) => allowed.has(o.id));
    } else {
      this.categoryOptions = allOptions;
    }
    const selected: CategoryEnum[] = this.form.get('categories')?.value ?? [];
    const validIds = new Set(this.categoryOptions.map((c) => c.id));
    const stillValid = selected.filter((c) => validIds.has(c));
    if (stillValid.length !== selected.length) {
      this.form.get('categories')?.setValue(stillValid);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['trip'] && this.trip) {
      this.updateCategoryOptions(this.trip.sport ?? null);
      this.form.patchValue({
        ...this.trip,
        departureDate: this.trip.departureDate ? new Date(this.trip.departureDate + 'T12:00:00Z') : null,
        returnDate: this.trip.returnDate ? new Date(this.trip.returnDate + 'T12:00:00Z') : null,
        registrationDeadline: this.trip.registrationDeadline
          ? new Date(this.trip.registrationDeadline + 'T12:00:00Z')
          : null,
        categories: this.trip.categories ?? [],
      });
    }
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const payload: CreateTripPayload = {
      name: v.name,
      destination: v.destination,
      sport: v.sport ?? undefined,
      categories: v.categories?.length ? v.categories : undefined,
      departureDate: v.departureDate ? format(new Date(v.departureDate), 'yyyy-MM-dd') : '',
      returnDate: v.returnDate ? format(new Date(v.returnDate), 'yyyy-MM-dd') : undefined,
      registrationDeadline: v.registrationDeadline
        ? format(new Date(v.registrationDeadline), 'yyyy-MM-dd')
        : undefined,
      costPerPerson: v.costPerPerson ?? 0,
      status: v.status,
      description: v.description ?? undefined,
    };
    this.formSubmit.emit(payload);
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
