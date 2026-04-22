import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs/operators';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CategoryEnum, IPlayerFeeStatusRow, SportEnum } from '@ltrc-campo/shared-api-model';
import { CategoryOption, getCategoryLabel, getCategoryOptionsBySport } from '../../../common/category-options';
import { UserFilterContextService } from '../../../common/services/user-filter-context.service';
import { PlayerFeesAdminService } from '../../../player-fees/services/player-fees-admin.service';
import { EligibilityReportPdfService } from '../../services/eligibility-report-pdf.service';

@Component({
  selector: 'ltrc-eligibility-report',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './eligibility-report.component.html',
  styleUrl: './eligibility-report.component.scss',
})
export class EligibilityReportComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterContext = inject(UserFilterContextService);
  private readonly adminService = inject(PlayerFeesAdminService);
  private readonly pdfService = inject(EligibilityReportPdfService);
  private readonly snackBar = inject(MatSnackBar);

  filterForm: FormGroup = this.fb.group({
    season: [this.currentSeason()],
    sport: [null as SportEnum | null],
    category: [null as CategoryEnum | null],
  });

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
  loading = signal(false);
  generatingPdf = signal(false);

  readonly hasCursos = computed(() => this.rows().some(r => r.cursosAprobados !== undefined));
  readonly hasFondo = computed(() => this.rows().some(r => r.fondoSolidarioPagado !== undefined));

  readonly displayedColumns = computed(() => {
    const cols = ['player', 'category', 'feePaid', 'fichaMedica', 'fichajeBDUAR'];
    if (this.hasCursos()) cols.push('cursosAprobados');
    if (this.hasFondo()) cols.push('fondoSolidarioPagado');
    cols.push('habilitado');
    return cols;
  });

  readonly stats = computed(() => {
    const all = this.rows();
    return {
      total: all.length,
      pagados: all.filter(r => r.feePaid).length,
      habilitados: all.filter(r => r.habilitado).length,
    };
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
        if (ctx.forcedCategory) this.filterForm.get('category')!.setValue(ctx.forcedCategory, { emitEvent: false });
        this.search();
      });

    this.filterForm.valueChanges.pipe(
      debounceTime(300),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.search());
  }

  onSportChange(): void {
    const sport = this.filterForm.get('sport')?.value as SportEnum | null;
    this.selectedSport.set(sport);
    const currentCat = this.filterForm.get('category')?.value;
    if (currentCat && !this.availableCategories().some((c: CategoryOption) => c.id === currentCat)) {
      this.filterForm.get('category')?.setValue(null, { emitEvent: false });
    }
  }

  search(): void {
    const { season, sport, category } = this.filterForm.getRawValue();
    if (!season || !sport) return;
    this.loading.set(true);
    this.adminService.getStatus({ season, sport, category: category ?? undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => { this.rows.set(data); this.loading.set(false); },
        error: () => {
          this.loading.set(false);
          this.snackBar.open('Error al cargar los datos', 'Cerrar', { duration: 4000 });
        },
      });
  }

  async downloadPdf(): Promise<void> {
    if (!this.rows().length) return;
    this.generatingPdf.set(true);
    const { season, sport, category } = this.filterForm.getRawValue();
    try {
      await this.pdfService.generate(this.rows(), {
        season,
        sport,
        category,
        hasCursos: this.hasCursos(),
        hasFondo: this.hasFondo(),
      });
    } catch {
      this.snackBar.open('Error al generar el PDF', 'Cerrar', { duration: 3000 });
    } finally {
      this.generatingPdf.set(false);
    }
  }

  readonly getCategoryLabel = getCategoryLabel;

  private currentSeason(): string {
    return String(new Date().getFullYear());
  }
}
