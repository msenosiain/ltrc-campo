import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
  OnInit,
  inject,
  DestroyRef,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { AsyncPipe, DecimalPipe } from '@angular/common';
import { Observable, startWith, map } from 'rxjs';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import {
  BlockEnum,
  CategoryEnum,
  HockeyBranchEnum,
  Match,
  MatchStatusEnum,
  MatchTypeEnum,
  RoleEnum,
  SportEnum,
  Tournament,
  getBlockCategories,
  isCompetitiveCategory,
} from '@ltrc-campo/shared-api-model';
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';
import {
  getCategoryOptionsBySport,
  matchStatusOptions,
  sportOptions,
} from '../../match-options';
import { CategoryOption } from '../../../common/category-options';

interface CategoryGroup {
  label: string;
  categories: CategoryOption[];
}
import { buildCreateMatchForm } from '../../forms/match-form.factory';
import { MatchFormValue } from '../../forms/match-form.types';
import { MatchesService } from '../../services/matches.service';
import { TournamentsService } from '../../../tournaments/services/tournaments.service';
import { PaymentsService } from '../../../payments/services/payments.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

function filterOptions(options: string[], value: string): string[] {
  const lc = (value ?? '').toLowerCase();
  return options.filter((o) => o.toLowerCase().includes(lc));
}

@Component({
  standalone: true,
  selector: 'ltrc-match-form',
  imports: [
    ReactiveFormsModule,
    AsyncPipe,
    DecimalPipe,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatCardModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatSlideToggleModule,
    MatAutocompleteModule,
    MatChipsModule,
    AllowedRolesDirective,
  ],
  templateUrl: './match-form.component.html',
  styleUrl: './match-form.component.scss',
})
export class MatchFormComponent implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly matchesService = inject(MatchesService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly paymentsService = inject(PaymentsService);
  private readonly destroyRef = inject(DestroyRef);

  @Input() match?: Match;
  @Input() submitting = false;

  @Output() readonly formSubmit = new EventEmitter<MatchFormValue>();
  @Output() readonly cancel = new EventEmitter<void>();

  readonly statusOptions = matchStatusOptions;
  readonly sportOptions = sportOptions;
  readonly MatchStatusEnum = MatchStatusEnum;
  readonly RoleEnum = RoleEnum;
  readonly SportEnum = SportEnum;
  readonly branchOptions = Object.values(HockeyBranchEnum);

  categoryOptions: CategoryOption[] = getCategoryOptionsBySport(null);
  categoryGroups: CategoryGroup[] = [];
  filteredTournaments: Tournament[] = [];
  tournaments: Tournament[] = [];
  matchForm: FormGroup = buildCreateMatchForm(this.fb);

  /** Whether the current category + sport combination is competitive */
  isCompetitive = false;

  mpFeeRate = 0.0483;

  /** Sport derived from the selected tournament */
  tournamentSport: SportEnum | null = null;

  /** Control de hora: standalone, no forma parte de MatchFormValue.
   *  Al cambiar, fusiona la hora en el control `date` del form. */
  readonly timeControl = new FormControl<string>('', Validators.required);

  private allOpponents: string[] = [];
  private allVenues: string[] = [];
  private allDivisions: string[] = [];

  filteredOpponents$!: Observable<string[]>;
  filteredOpponentsForChips$!: Observable<string[]>;
  filteredVenues$!: Observable<string[]>;
  filteredDivisions$!: Observable<string[]>;

  readonly separatorKeyCodes = [ENTER, COMMA] as const;
  readonly opponentChipInputControl = new FormControl<string>('');
  opponents: string[] = [];
  private justSelectedFromAc = false;

  ngOnInit(): void {
    // Always clear opponent FormControl validators — rivals are managed as chips array
    this.matchForm.get('opponent')!.clearValidators();
    this.matchForm.get('opponent')!.updateValueAndValidity({ emitEvent: false });

    // Chip autocomplete for rivals (both create and edit)
    this.filteredOpponentsForChips$ = this.opponentChipInputControl.valueChanges.pipe(
      startWith(''),
      map((v) => filterOptions(this.allOpponents, v ?? '')),
      takeUntilDestroyed(this.destroyRef)
    );

    if (!this.match) {
      // Create mode: use categories (multi-select)
      this.matchForm.get('category')!.clearValidators();
      this.matchForm.get('category')!.updateValueAndValidity({ emitEvent: false });

      this.matchForm.get('categories')!.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.updateCompetitive());
    }
    this.updateCategoryGroups();

    this.filteredOpponents$ = this.matchForm.get('opponent')!.valueChanges.pipe(
      startWith(''),
      map((v) => filterOptions(this.allOpponents, v ?? '')),
      takeUntilDestroyed(this.destroyRef)
    );
    this.filteredVenues$ = this.matchForm.get('venue')!.valueChanges.pipe(
      startWith(''),
      map((v) => filterOptions(this.allVenues, v ?? '')),
      takeUntilDestroyed(this.destroyRef)
    );
    this.filteredDivisions$ = this.matchForm.get('division')!.valueChanges.pipe(
      startWith(''),
      map((v) => filterOptions(this.allDivisions, v ?? '')),
      takeUntilDestroyed(this.destroyRef)
    );

    this.paymentsService.getConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ mpFeeRate }) => (this.mpFeeRate = mpFeeRate));

    this.matchesService
      .getFieldOptions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ opponents, venues, divisions }) => {
        this.allOpponents = opponents;
        this.allVenues = venues;
        this.allDivisions = divisions;
      });

    this.tournamentsService
      .getTournaments({ page: 1, size: 1000 })
      .pipe(map((res) => res.items))
      .subscribe((t) => {
        this.tournaments = t;
        this.filteredTournaments = t;
      });

    // When sport control changes: filter tournament list, recompute competitive
    this.matchForm.get('sport')!.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sport) => {
        this.filteredTournaments = sport
          ? this.tournaments.filter((t) => !t.sport || t.sport === sport)
          : this.tournaments;
        // If current tournament no longer in filtered list, clear it
        const currentTournament = this.matchForm.get('tournament')?.value;
        if (currentTournament && !this.filteredTournaments.find((t) => t.id === currentTournament)) {
          this.matchForm.get('tournament')?.setValue('');
        }
        this.updateSportValidation();
        this.updateCompetitive();
        this.updateCategoryGroups();
      });

    // When tournament changes: derive sport, update categories, compute competitive
    this.matchForm
      .get('tournament')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((tournamentId: string | null) => {
        this.applyTournamentDefaults(tournamentId);
      });

    // When category changes: recompute competitive
    this.matchForm
      .get('category')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateCompetitive();
      });

    // Cuando el usuario selecciona una hora, fusionarla en el control date.
    this.timeControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((time) => this.applyTimeToDate(time ?? ''));

    // Cuando el datepicker cambia la fecha, re-aplicar la hora para no perderla.
    // También sincroniza la fecha de vencimiento del cobro si está habilitado.
    this.matchForm
      .get('date')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((newDate) => {
        if (this.timeControl.value) {
          this.applyTimeToDate(this.timeControl.value);
        }
        if (this.paymentEnabled && newDate) {
          this.matchForm.get('payment.expiresAt')?.setValue(newDate, { emitEvent: false });
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['match'] && this.match) {
      const tournament = this.match.tournament as Tournament | undefined;
      this.tournamentSport = tournament?.sport ?? null;
      this.categoryOptions = this.categoryOptionsForTournament(tournament);

      const matchDate = this.match.date ? new Date(this.match.date) : null;
      const h = matchDate?.getHours() ?? 0;
      const m = matchDate?.getMinutes() ?? 0;
      const timeStr = h || m
        ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        : '';
      this.timeControl.setValue(timeStr, { emitEvent: false });

      const storedOpponent = (this.match as any).opponent as string | undefined;
      this.opponents = storedOpponent ? storedOpponent.split(', ').filter(Boolean) : [];

      const md = (this.match as any).matchDay;
      this.matchForm.patchValue({
        ...this.match,
        date: matchDate,
        sport: tournament?.sport ?? (this.match as any).sport ?? null,
        tournament: tournament?.id ?? '',
        name: (this.match as any).name ?? '',
        branch: (this.match as any).branch ?? null,
        matchDay: {
          referee: md?.referee ?? '',
          ar1: md?.ar1 ?? '',
          ar2: md?.ar2 ?? '',
          headCoach: md?.headCoach ?? '',
        },
      });

      if (tournament) {
        this.matchForm.get('sport')!.disable({ emitEvent: false });
      } else {
        this.matchForm.get('sport')!.enable({ emitEvent: false });
      }

      this.updateCompetitive();
    }
  }

  get isHockey(): boolean {
    const sport = this.tournamentSport ?? (this.matchForm.get('sport')?.value as SportEnum | null);
    return sport === SportEnum.HOCKEY;
  }

  get statusValue(): MatchStatusEnum {
    return this.matchForm.get('status')?.value;
  }

  get paymentEnabled(): boolean {
    return this.matchForm.get('payment.enabled')?.value === true;
  }

  get paymentNetTarget(): number {
    return this.matchForm.get('payment.amount')?.value ?? 0;
  }

  get paymentRawGross(): number {
    return this.paymentNetTarget / (1 - this.mpFeeRate);
  }

  get paymentGrossAmount(): number {
    return Math.ceil(this.paymentRawGross / 10) * 10;
  }

  get paymentMpFeeAmount(): number {
    return Math.round(this.paymentGrossAmount * this.mpFeeRate * 100) / 100;
  }

  get paymentNetAmount(): number {
    return Math.round((this.paymentGrossAmount - this.paymentMpFeeAmount) * 100) / 100;
  }

  get formInvalid(): boolean {
    if (this.matchForm.invalid || this.timeControl.invalid) return true;
    if (!this.match && (this.matchForm.get('categories')?.value?.length ?? 0) === 0) return true;
    if (this.isCompetitive && this.opponents.length === 0) return true;
    if (!this.match && this.paymentEnabled) {
      if (!this.matchForm.get('payment.amount')?.value) return true;
      if (!this.matchForm.get('payment.expiresAt')?.value) return true;
    }
    return false;
  }

  togglePayment(): void {
    const ctrl = this.matchForm.get('payment.enabled');
    const enabling = !ctrl?.value;
    ctrl?.setValue(enabling);
    if (enabling) {
      const matchDate = this.matchForm.get('date')?.value as Date | null;
      if (matchDate) {
        this.matchForm.get('payment.expiresAt')?.setValue(matchDate);
      }
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onSubmit(): void {
    if (this.formInvalid) return;
    const value = this.matchForm.getRawValue() as MatchFormValue;
    this.formSubmit.emit({ ...value, opponents: this.opponents });
  }

  addOpponentOnBlur(): void {
    // Small delay to let autocomplete selection fire first
    setTimeout(() => {
      const value = (this.opponentChipInputControl.value ?? '').trim();
      if (value && !this.opponents.includes(value)) {
        this.opponents = [...this.opponents, value];
        this.opponentChipInputControl.setValue('');
        this.updateCompetitive();
      }
    }, 150);
  }

  addOpponentFromInput(event: MatChipInputEvent): void {
    if (this.justSelectedFromAc) {
      this.justSelectedFromAc = false;
      event.chipInput.clear();
      return;
    }
    const value = (event.value ?? '').trim();
    if (value && !this.opponents.includes(value)) {
      this.opponents = [...this.opponents, value];
      this.updateCompetitive();
    }
    event.chipInput.clear();
    this.opponentChipInputControl.setValue('');
  }

  addOpponentFromAutocomplete(event: MatAutocompleteSelectedEvent): void {
    this.justSelectedFromAc = true;
    const value = event.option.value as string;
    if (value && !this.opponents.includes(value)) {
      this.opponents = [...this.opponents, value];
      this.updateCompetitive();
    }
    this.opponentChipInputControl.setValue('');
  }

  removeOpponent(opp: string): void {
    this.opponents = this.opponents.filter((o) => o !== opp);
    this.updateCompetitive();
  }

  private categoryOptionsForTournament(tournament: Tournament | undefined): CategoryOption[] {
    if (tournament?.categories?.length) {
      const allForSport = getCategoryOptionsBySport(tournament.sport ?? null);
      return allForSport.filter((opt) => tournament.categories!.includes(opt.id));
    }
    return getCategoryOptionsBySport(tournament?.sport ?? null);
  }

  private updateSportValidation(): void {
    // Sport is always required. When a tournament is selected, the control is
    // disabled (sport comes from the tournament) but the validator stays.
    const sportCtrl = this.matchForm.get('sport')!;
    sportCtrl.setValidators(Validators.required);
    sportCtrl.updateValueAndValidity({ emitEvent: false });
  }

  private applyTournamentDefaults(tournamentId: string | null): void {
    const tournament = this.tournaments.find((t) => t.id === tournamentId);
    this.tournamentSport = tournament?.sport ?? null;
    this.categoryOptions = this.categoryOptionsForTournament(tournament);
    this.updateCategoryGroups();

    if (tournament) {
      this.matchForm.get('sport')!.setValue(tournament.sport ?? null, { emitEvent: false });
      this.matchForm.get('sport')!.disable({ emitEvent: false });
    } else {
      this.matchForm.get('sport')!.enable({ emitEvent: false });
    }
    this.updateSportValidation();

    if (!this.match) {
      // Create mode: pre-fill categories only if tournament type is encounter
      if (tournament?.type === MatchTypeEnum.ENCOUNTER && tournament.categories?.length) {
        this.matchForm.get('categories')?.setValue(tournament.categories);
      } else if (this.categoryOptions.length === 1) {
        this.matchForm.get('categories')?.setValue([this.categoryOptions[0].id]);
      } else {
        this.matchForm.get('categories')?.setValue([]);
      }
    } else {
      // Edit mode: auto-select single category if only one option
      if (this.categoryOptions.length === 1) {
        this.matchForm.get('category')?.setValue(this.categoryOptions[0].id);
      } else {
        const currentCat = this.matchForm.get('category')?.value;
        if (currentCat && !this.categoryOptions.find((c) => c.id === currentCat)) {
          this.matchForm.get('category')?.setValue(null);
        }
      }
    }

    this.updateCompetitive();
  }

  private updateCategoryGroups(): void {
    const sport = this.tournamentSport ?? (this.matchForm.get('sport')?.value as SportEnum | null);
    const available = getCategoryOptionsBySport(sport);
    const availableSet = new Set(available.map((c) => c.id));

    const blockDefs: { label: string; block: BlockEnum }[] = [
      { label: 'Infantiles', block: BlockEnum.INFANTILES },
      { label: 'Cadetes', block: BlockEnum.CADETES },
      { label: 'Juveniles', block: BlockEnum.JUVENILES },
      { label: 'Mayores', block: BlockEnum.MAYORES },
      { label: 'Plantel Superior', block: BlockEnum.PLANTEL_SUPERIOR },
    ];

    this.categoryGroups = blockDefs
      .map((def) => ({
        label: def.label,
        categories: getBlockCategories(def.block)
          .filter((cat) => availableSet.has(cat))
          .map((cat) => available.find((c) => c.id === cat)!)
          .filter(Boolean),
      }))
      .filter((g) => g.categories.length > 0);
  }

  private updateCompetitive(): void {
    const sport = this.tournamentSport ?? (this.matchForm.get('sport')?.value as SportEnum | null);
    const wasCompetitive = this.isCompetitive;

    if (this.match) {
      const category = this.matchForm.get('category')?.value as CategoryEnum | null;
      this.isCompetitive = !!category && !!sport && isCompetitiveCategory(category, sport);
    } else {
      const categories = this.matchForm.get('categories')?.value as CategoryEnum[];
      const first = categories?.[0] ?? null;
      this.isCompetitive = !!first && !!sport && isCompetitiveCategory(first, sport);
    }

    if (this.isCompetitive !== wasCompetitive) {
      this.updateOpponentValidation();
    }
  }

  private updateOpponentValidation(): void {
    // Rivals are managed as chips array; validated via formInvalid getter
  }

  private applyTimeToDate(time: string): void {
    const date = this.matchForm.get('date')?.value as Date | null;
    if (!date || !time) return;
    const [h, m] = time.split(':').map(Number);
    const merged = new Date(date);
    merged.setHours(h ?? 0, m ?? 0, 0, 0);
    this.matchForm.get('date')?.setValue(merged, { emitEvent: false });
  }
}
