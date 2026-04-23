import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatDialogModule } from '@angular/material/dialog';
import { DecimalPipe } from '@angular/common';
import { CategoryEnum, IPlayerFeeConfig, IPlayerFeeStatusRow, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { CategoryOption, getCategoryLabel, getCategoryOptionsBySport } from '../../../common/category-options';
import { UserFilterContextService } from '../../../common/services/user-filter-context.service';
import { PlayerFeesAdminService } from '../../services/player-fees-admin.service';
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';
import { MatDialog } from '@angular/material/dialog';
import { ManualFeePaymentDialogComponent } from '../manual-fee-payment-dialog/manual-fee-payment-dialog.component';

@Component({
  selector: 'ltrc-player-fees-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatTableModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatChipsModule,
    DecimalPipe,
    AllowedRolesDirective,
    MatDialogModule,
  ],
  templateUrl: './player-fees-list.component.html',
  styleUrl: './player-fees-list.component.scss',
})
export class PlayerFeesListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterContext = inject(UserFilterContextService);
  private readonly adminService = inject(PlayerFeesAdminService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(Clipboard);
  private readonly dialog = inject(MatDialog);

  readonly RoleEnum = RoleEnum;

  filterForm: FormGroup = this.fb.group({
    season: [this.currentSeason()],
    sport: [null as SportEnum | null],
  });

  categoryFilter = signal<CategoryEnum[]>([]);

  private readonly selectedSport = signal<SportEnum | null>(null);

  readonly availableSports = computed(() => this.filterContext.filterContext().sportOptions);

  readonly availableCategories = computed((): CategoryOption[] => {
    const sport = this.selectedSport();
    const ctxCats = this.filterContext.filterContext().categoryOptions;
    if (!sport) return ctxCats;
    const forSport = getCategoryOptionsBySport(sport);
    return ctxCats.filter((c: CategoryOption) => forSport.some(o => o.id === c.id));
  });

  rows = signal<IPlayerFeeStatusRow[]>([]);
  nameFilter = signal('');
  feePaidFilter = signal<boolean | null>(null);
  membershipFilter = signal<boolean | null>(null);
  bduarFilter = signal<boolean | null>(null);
  coursesFilter = signal<boolean | null>(null);
  solidarityFilter = signal<boolean | null>(null);
  eligibleFilter = signal<boolean | null>(null);
  loading = signal(false);
  configs = signal<IPlayerFeeConfig[]>([]);

  readonly filteredRows = computed(() => {
    const term = this.nameFilter().toLowerCase().trim();
    const cats = this.categoryFilter();
    const feePaid = this.feePaidFilter();
    const membership = this.membershipFilter();
    const bduar = this.bduarFilter();
    const courses = this.coursesFilter();
    const solidarity = this.solidarityFilter();
    const eligible = this.eligibleFilter();
    return this.rows().filter(r => {
      if (term && !r.playerName?.toLowerCase().includes(term) && !r.playerDni?.includes(term)) return false;
      if (cats.length && !cats.includes(r.category as CategoryEnum)) return false;
      if (feePaid !== null && r.feePaid !== feePaid) return false;
      if (membership !== null && r.membershipCurrent !== membership) return false;
      if (bduar !== null && r.bduarRegistered !== bduar) return false;
      if (courses !== null && r.coursesApproved !== undefined && r.coursesApproved !== courses) return false;
      if (solidarity !== null && r.solidarityFundPaid !== undefined && r.solidarityFundPaid !== solidarity) return false;
      if (eligible !== null && r.eligible !== eligible) return false;
      return true;
    });
  });

  readonly stats = computed(() => {
    const all = this.filteredRows();
    return {
      total: all.length,
      paid: all.filter(r => r.feePaid).length,
      eligible: all.filter(r => r.eligible).length,
    };
  });

  readonly hasCursos = computed(() =>
    this.filteredRows().some(r => r.coursesApproved !== undefined)
  );

  readonly hasFondoSolidario = computed(() =>
    this.filteredRows().some(r => r.solidarityFundPaid !== undefined)
  );

  readonly displayedColumns = computed(() => {
    const cols = ['player', 'category', 'membershipCurrent', 'feePaid', 'bduarRegistered'];
    if (this.hasCursos()) cols.push('coursesApproved');
    if (this.hasFondoSolidario()) cols.push('solidarityFundPaid');
    cols.push('eligible');
    return cols;
  });

  readonly activeConfig = computed((): IPlayerFeeConfig | null => {
    const sport = this.selectedSport();
    const season = this.filterForm.get('season')?.value;
    if (!sport || !season) return null;
    return this.configs().find(c => c.sport === sport && c.season === season && c.active) ?? null;
  });

  get seasonOptions(): string[] {
    const year = new Date().getFullYear();
    return [String(year + 1), String(year), String(year - 1)];
  }

  ngOnInit(): void {
    this.filterContext.filterContext$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ctx) => {
        if (ctx.forcedSport) {
          this.filterForm.get('sport')!.setValue(ctx.forcedSport, { emitEvent: false });
          this.selectedSport.set(ctx.forcedSport);
        }
        if (ctx.forcedCategory) this.categoryFilter.set([ctx.forcedCategory]);
        this.rows.set([]);
        this.search();
      });

    this.adminService.getConfigs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(configs => this.configs.set(configs));
  }

  onSportChange(): void {
    const sport = this.filterForm.get('sport')?.value as SportEnum | null;
    this.selectedSport.set(sport);
    // Clear category filter if selected cats no longer valid for this sport
    const currentCats = this.categoryFilter();
    if (currentCats.length) {
      const valid = currentCats.filter(c => this.availableCategories().some(o => o.id === c));
      this.categoryFilter.set(valid);
    }
    this.rows.set([]);
    this.search();
  }

  onFilterChange(): void {
    this.rows.set([]);
    this.search();
  }

  search(silent = false): void {
    const { season, sport } = this.filterForm.getRawValue();
    if (!season || !sport) return;
    if (!silent) this.loading.set(true);
    this.adminService.getStatus({ season, sport })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => { this.rows.set(data); if (!silent) this.loading.set(false); },
        error: () => {
          if (!silent) this.loading.set(false);
          this.snackBar.open('Error al cargar los datos', 'Cerrar', { duration: 4000 });
        },
      });
  }

  toggleRecord(row: IPlayerFeeStatusRow, field: keyof Pick<IPlayerFeeStatusRow, 'membershipCurrent' | 'bduarRegistered' | 'coursesApproved' | 'solidarityFundPaid'>, value: boolean): void {
    const { season, sport } = this.filterForm.value;
    // Optimistic update
    this.rows.update(rows => rows.map(r => r.playerId === row.playerId ? { ...r, [field]: value } : r));

    this.adminService.updateSeasonRecord(row.playerId, { season, sport, [field]: value })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.search(true),
        error: () => {
          // Revert
          this.rows.update(rows => rows.map(r => r.playerId === row.playerId ? { ...r, [field]: !value } : r));
          this.snackBar.open('Error al guardar', 'Cerrar', { duration: 3000 });
        },
      });
  }

  readonly getCategoryLabel = getCategoryLabel;

  openManualPayment(): void {
    const { season, sport } = this.filterForm.value;
    const ref = this.dialog.open(ManualFeePaymentDialogComponent, {
      width: '420px',
      data: { rows: this.rows(), season, sport },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) this.search();
    });
  }

  copyPaymentLink(): void {
    const config = this.activeConfig();
    if (!config) return;
    const url = `${window.location.origin}/player-fee/${config.linkToken}`;
    this.clipboard.copy(url);
    this.snackBar.open('Link copiado al portapapeles', 'Cerrar', { duration: 3000 });
  }

  private currentSeason(): string {
    return String(new Date().getFullYear());
  }
}
