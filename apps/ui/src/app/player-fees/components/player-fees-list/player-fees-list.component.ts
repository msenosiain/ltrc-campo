import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { Clipboard } from '@angular/cdk/clipboard';
import { DecimalPipe } from '@angular/common';
import { CategoryEnum, IPlayerFeeConfig, IPlayerFeeStatusRow, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { CategoryOption, getCategoryOptionsBySport } from '../../../common/category-options';
import { UserFilterContextService } from '../../../common/services/user-filter-context.service';
import { PlayerFeesAdminService } from '../../services/player-fees-admin.service';
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';
import { Router } from '@angular/router';

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
    MatProgressBarModule,
    MatTableModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatChipsModule,
    DecimalPipe,
    AllowedRolesDirective,
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
  private readonly router = inject(Router);

  readonly RoleEnum = RoleEnum;

  filterForm: FormGroup = this.fb.group({
    season: [this.currentSeason()],
    sport: [null as SportEnum | null],
    category: [null as CategoryEnum | null],
  });

  private readonly selectedSport = toSignal(
    this.filterForm.get('sport')!.valueChanges.pipe(startWith(this.filterForm.get('sport')!.value as SportEnum | null))
  );

  readonly availableSports = computed(() => this.filterContext.filterContext().sportOptions);

  readonly availableCategories = computed((): CategoryOption[] => {
    const sport = this.selectedSport();
    const ctxCats = this.filterContext.filterContext().categoryOptions;
    if (!sport) return ctxCats;
    const forSport = getCategoryOptionsBySport(sport);
    return ctxCats.filter((c: CategoryOption) => forSport.some(o => o.id === c.id));
  });

  rows = signal<IPlayerFeeStatusRow[]>([]);
  loading = signal(false);
  configs = signal<IPlayerFeeConfig[]>([]);

  readonly stats = computed(() => {
    const all = this.rows();
    return {
      total: all.length,
      pagados: all.filter(r => r.feePaid).length,
      habilitados: all.filter(r => r.habilitado).length,
    };
  });

  readonly hasFondoSolidario = computed(() =>
    this.rows().some(r => r.fondoSolidarioPagado !== undefined)
  );

  readonly displayedColumns = computed(() => {
    const cols = ['player', 'category', 'feePaid', 'fichaMedica', 'cursosAprobados', 'fichajeBDUAR', 'fichajeUnion'];
    if (this.hasFondoSolidario()) cols.push('fondoSolidarioPagado');
    cols.push('habilitado');
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
        if (ctx.forcedSport) this.filterForm.get('sport')!.setValue(ctx.forcedSport, { emitEvent: false });
        if (ctx.forcedCategory) this.filterForm.get('category')!.setValue(ctx.forcedCategory, { emitEvent: false });
        this.search();
      });

    this.filterForm.get('sport')!.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const currentCat = this.filterForm.get('category')?.value;
        if (currentCat && !this.availableCategories().some((c: CategoryOption) => c.id === currentCat)) {
          this.filterForm.get('category')?.setValue(null, { emitEvent: false });
        }
        this.rows.set([]);
        this.search();
      });

    this.filterForm.get('season')!.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.rows.set([]); this.search(); });

    this.filterForm.get('category')!.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.search());

    this.adminService.getConfigs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(configs => this.configs.set(configs));
  }

  search(): void {
    const { season, sport, category } = this.filterForm.value;
    if (!season || !sport) return;
    this.loading.set(true);
    this.adminService.getStatus({ season, sport, category: category ?? undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => { this.rows.set(data); this.loading.set(false); },
        error: () => { this.loading.set(false); },
      });
  }

  toggleRecord(row: IPlayerFeeStatusRow, field: keyof Pick<IPlayerFeeStatusRow, 'fichaMedica' | 'cursosAprobados' | 'fichajeBDUAR' | 'fichajeUnion' | 'fondoSolidarioPagado'>, value: boolean): void {
    const { season, sport } = this.filterForm.value;
    // Optimistic update
    this.rows.update(rows => rows.map(r => r.playerId === row.playerId ? { ...r, [field]: value } : r));

    this.adminService.updateSeasonRecord(row.playerId, { season, sport, [field]: value })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          // Revert
          this.rows.update(rows => rows.map(r => r.playerId === row.playerId ? { ...r, [field]: !value } : r));
          this.snackBar.open('Error al guardar', 'Cerrar', { duration: 3000 });
        },
      });
  }

  goToSettings(): void {
    this.router.navigate(['/dashboard/player-fees/settings']);
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
