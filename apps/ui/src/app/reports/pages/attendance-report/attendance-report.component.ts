import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime } from 'rxjs';
import { format } from 'date-fns';
import {
  AttendanceReportPlayerRow,
  AttendanceReportResponse,
  CategoryEnum,
  RoleEnum,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import { getCategoryLabel, getCategoryOptionsBySport } from '../../../common/category-options';
import { API_CONFIG_TOKEN } from '../../../app.config';
import { AuthService } from '../../../auth/auth.service';
import { PlayersService } from '../../../players/services/players.service';
import {
  AttendanceReportPdfContext,
  AttendanceReportPdfService,
} from '../../services/attendance-report-pdf.service';

type AttendanceType = 'training' | 'match' | 'both';
type PlayerOption = { id: string; name: string };

@Component({
  selector: 'ltrc-attendance-report',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatDatepickerModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatCardModule,
    MatSnackBarModule,
  ],
  templateUrl: './attendance-report.component.html',
  styleUrl: './attendance-report.component.scss',
})
export class AttendanceReportComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);
  private readonly pdfService = inject(AttendanceReportPdfService);
  private readonly authService = inject(AuthService);
  private readonly playersService = inject(PlayersService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  private readonly currentUser = toSignal(this.authService.user$);
  private readonly isAdmin = computed(
    () => this.currentUser()?.roles?.includes(RoleEnum.ADMIN) ?? false
  );

  loading = signal(false);
  generatingPdf = signal(false);
  players = signal<AttendanceReportPlayerRow[]>([]);
  meta = signal<AttendanceReportResponse['meta'] | null>(null);
  expandedPlayerId = signal<string | null>(null);
  playerOptions = signal<PlayerOption[]>([]);

  readonly filterForm = new FormGroup({
    sport: new FormControl<SportEnum | null>(null),
    category: new FormControl<CategoryEnum | null>(null),
    playerId: new FormControl<string | null>(null),
    type: new FormControl<AttendanceType>('both', { nonNullable: true }),
    fromDate: new FormControl<Date | null>(this.defaultFromDate()),
    toDate: new FormControl<Date | null>(new Date()),
  });

  readonly playerSearchControl = new FormControl<string | PlayerOption | null>(null);

  private readonly selectedSport = toSignal(
    this.filterForm.controls.sport.valueChanges,
    { initialValue: null }
  );

  private readonly playerSearchValue = toSignal(this.playerSearchControl.valueChanges, {
    initialValue: null as string | PlayerOption | null,
  });

  readonly filteredPlayerOptions = computed(() => {
    const term = this.playerSearchValue();
    const options = this.playerOptions();
    if (typeof term !== 'string' || !term.trim()) return options;
    const text = term.trim().toLowerCase();
    return options.filter((p) => p.name.toLowerCase().includes(text));
  });

  readonly availableSports = computed(() => {
    const user = this.currentUser();
    const assigned = user?.sports ?? [];
    const all = Object.values(SportEnum);
    const sports = this.isAdmin() || !assigned.length ? all : assigned;
    return sports.map((v) => ({ value: v, label: v === SportEnum.RUGBY ? 'Rugby' : 'Hockey' }));
  });

  readonly availableCategories = computed(() => {
    const user = this.currentUser();
    const assigned = new Set(user?.categories ?? []);
    const sport = this.selectedSport();
    const all = getCategoryOptionsBySport(sport);
    return this.isAdmin() || !assigned.size ? all : all.filter((c) => assigned.has(c.id));
  });

  readonly displayedColumns = computed(() => {
    const type = this.filterForm.controls.type.value;
    const base = ['name', 'category'];
    if (type === 'training') return [...base, 'trainingPresent', 'trainingPct'];
    if (type === 'match') return [...base, 'matchPresent', 'matchPct'];
    return [...base, 'trainingPresent', 'trainingPct', 'matchPresent', 'matchPct'];
  });

  readonly totalsRow = computed(() => {
    const rows = this.players();
    const sum = (fn: (r: AttendanceReportPlayerRow) => number) => rows.reduce((s, r) => s + fn(r), 0);
    const trainingTotal = sum((r) => r.training.total);
    const trainingPresent = sum((r) => r.training.present);
    const matchTotal = sum((r) => r.match.total);
    const matchPresent = sum((r) => r.match.present);
    return {
      players: rows.length,
      trainingPct: trainingTotal > 0 ? Math.round((trainingPresent / trainingTotal) * 100) : 0,
      matchPct: matchTotal > 0 ? Math.round((matchPresent / matchTotal) * 100) : 0,
    };
  });

  private defaultFromDate(): Date {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }

  ngOnInit() {
    // Pre-seleccionar deporte/categoría según la asignación del usuario (admin o sin asignación: sin preselección)
    const sports = this.availableSports();
    if (sports.length === 1) {
      this.filterForm.controls.sport.setValue(sports[0].value);
      const categories = this.availableCategories();
      if (categories.length === 1) {
        this.filterForm.controls.category.setValue(categories[0].id);
      }
    }

    this.filterForm.controls.sport.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.filterForm.controls.category.setValue(null, { emitEvent: false });
        this.resetPlayerSelection();
        this.loadPlayerOptions();
      });

    this.filterForm.controls.category.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.resetPlayerSelection();
        this.loadPlayerOptions();
      });

    this.filterForm.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.search());

    this.loadPlayerOptions();
    this.search();
  }

  private resetPlayerSelection() {
    this.filterForm.controls.playerId.setValue(null, { emitEvent: false });
    this.playerSearchControl.setValue(null, { emitEvent: false });
  }

  displayPlayerFn = (option: PlayerOption | string | null): string =>
    option && typeof option === 'object' ? option.name : option ?? '';

  onPlayerSelected(event: MatAutocompleteSelectedEvent) {
    const player = event.option.value as PlayerOption;
    this.filterForm.controls.playerId.setValue(player.id);
  }

  private loadPlayerOptions() {
    const sport = this.filterForm.controls.sport.value;
    if (!sport) {
      this.playerOptions.set([]);
      return;
    }
    const category = this.filterForm.controls.category.value;
    this.playersService
      .getPlayers({ page: 1, size: 300, filters: { sport, category: category ?? undefined } as any })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) =>
          this.playerOptions.set(
            res.items.filter((p): p is typeof p & { id: string } => !!p.id).map((p) => ({ id: p.id, name: p.name }))
          ),
        error: () => this.playerOptions.set([]),
      });
  }

  private buildParams(): HttpParams {
    const v = this.filterForm.value;
    let params = new HttpParams().set('type', v.type ?? 'both');
    if (v.sport) params = params.set('sport', v.sport);
    if (v.category) params = params.set('category', v.category);
    if (v.playerId) params = params.set('playerId', v.playerId);
    if (v.fromDate) params = params.set('fromDate', format(v.fromDate, 'yyyy-MM-dd'));
    if (v.toDate) params = params.set('toDate', format(v.toDate, 'yyyy-MM-dd'));
    return params;
  }

  search() {
    if (!this.filterForm.value.sport) {
      this.players.set([]);
      this.meta.set(null);
      return;
    }
    this.loading.set(true);
    this.http
      .get<AttendanceReportResponse>(`${this.config.baseUrl}/training-sessions/stats/attendance-report`, {
        params: this.buildParams(),
      })
      .subscribe({
        next: (res) => {
          this.players.set(res.players);
          this.meta.set(res.meta);
          this.expandedPlayerId.set(null);
          this.loading.set(false);
        },
        error: () => {
          this.snackBar.open('Error al cargar el reporte de asistencia', '', { duration: 3000 });
          this.loading.set(false);
        },
      });
  }

  toggleExpand(playerId: string) {
    this.expandedPlayerId.update((id) => (id === playerId ? null : playerId));
  }

  clearControl(name: 'category' | 'playerId' | 'fromDate' | 'toDate') {
    this.filterForm.get(name)?.setValue(null);
    if (name === 'playerId') this.playerSearchControl.setValue(null, { emitEvent: false });
  }

  getCategoryLabel(cat: CategoryEnum | undefined): string {
    return cat ? getCategoryLabel(cat) : '—';
  }

  statusLabel(status: string): string {
    if (status === 'present') return 'Presente';
    if (status === 'justified') return 'Justificado';
    if (status === 'other_match') return 'Otro partido';
    return 'Ausente';
  }

  downloadPdf() {
    const rows = this.players();
    if (!rows.length) return;
    const v = this.filterForm.value;
    this.generatingPdf.set(true);
    const ctx: AttendanceReportPdfContext = {
      sport: v.sport ?? null,
      category: v.category ?? null,
      fromDate: v.fromDate ? format(v.fromDate, 'yyyy-MM-dd') : '',
      toDate: v.toDate ? format(v.toDate, 'yyyy-MM-dd') : '',
      type: v.type ?? 'both',
    };
    this.pdfService
      .generate(rows, ctx)
      .catch(() => this.snackBar.open('Error al generar el PDF', '', { duration: 3000 }))
      .finally(() => this.generatingPdf.set(false));
  }

  readonly activeFilterCount = computed(() => {
    const v = this.filterForm.value;
    let n = 0;
    if (v.category) n++;
    if (v.playerId) n++;
    return n;
  });

  clearFilters() {
    this.filterForm.patchValue({ category: null, playerId: null });
    this.playerSearchControl.setValue(null, { emitEvent: false });
  }

  trackByPlayerId(_: number, row: AttendanceReportPlayerRow): string {
    return row.playerId;
  }
}
