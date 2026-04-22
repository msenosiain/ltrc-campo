import { Component, computed, effect, inject, signal, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { CategoryEnum, Match, PaginatedResponse, RoleEnum, SportEnum, Tournament } from '@ltrc-campo/shared-api-model';
import { getCategoryLabel, getCategoryOptionsBySport } from '../../../common/category-options';
import { API_CONFIG_TOKEN } from '../../../app.config';
import { AuthService } from '../../../auth/auth.service';
import { EncounterCategorySummary, EncounterReport, PaymentsService } from '../../../payments/services/payments.service';
import { EncounterPdfService } from '../../services/encounter-pdf.service';
import { format } from 'date-fns';

interface EncounterGroup {
  label: string;
  date: string;
  time?: string;
  opponent?: string;
  matchIds: string[];
  categories: string[];
}

@Component({
  selector: 'ltrc-encounter-report',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatDividerModule,
    RouterModule,
  ],
  templateUrl: './encounter-report.component.html',
  styleUrl: './encounter-report.component.scss',
})
export class EncounterReportComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);
  private readonly paymentsService = inject(PaymentsService);
  private readonly pdfService = inject(EncounterPdfService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly authService = inject(AuthService);

  private readonly tournamentsApiUrl = `${this.config.baseUrl}/tournaments`;
  private readonly matchesApiUrl = `${this.config.baseUrl}/matches`;

  private readonly currentUser = toSignal(this.authService.user$);
  private readonly isAdmin = computed(() => this.currentUser()?.roles?.includes(RoleEnum.ADMIN) ?? false);

  tournaments = signal<Tournament[]>([]);
  private allMatches = signal<Match[]>([]);
  encounters = signal<EncounterGroup[]>([]);
  report = signal<EncounterReport | null>(null);
  selectedEncounter = signal<EncounterGroup | null>(null);

  loadingTournaments = signal(false);
  loadingEncounters = signal(false);
  loadingReport = signal(false);
  generatingPdf = signal(false);

  readonly filterForm = new FormGroup({
    tournament: new FormControl<string>('', Validators.required),
    sport: new FormControl<SportEnum | null>(null),
    category: new FormControl<CategoryEnum[] | null>(null),
    date: new FormControl<Date | null>(null),
  });

  private readonly selectedSport = toSignal(
    this.filterForm.get('sport')!.valueChanges.pipe(startWith(null as SportEnum | null))
  );

  private readonly selectedTournamentId = toSignal(
    this.filterForm.get('tournament')!.valueChanges.pipe(startWith(null as string | null))
  );

  private readonly selectedTournament = computed(() =>
    this.tournaments().find(t => t.id === this.selectedTournamentId()) ?? null
  );

  readonly availableSports = computed(() => {
    const user = this.currentUser();
    const assigned = user?.sports ?? [];
    const all = Object.values(SportEnum);
    const tournament = this.selectedTournament();
    let sports = (this.isAdmin() || !assigned.length ? all : assigned);
    if (tournament?.sport) sports = sports.filter(s => s === tournament.sport);
    return sports.map(v => ({ value: v, label: v === SportEnum.RUGBY ? 'Rugby' : 'Hockey' }));
  });

  readonly availableCategories = computed(() => {
    const user = this.currentUser();
    const assigned = new Set(user?.categories ?? []);
    const sport = this.selectedSport() ?? null;
    const tournamentCats = this.selectedTournament()?.categories;
    const tournamentCatSet = tournamentCats?.length ? new Set(tournamentCats) : null;

    let all = getCategoryOptionsBySport(sport);
    if (tournamentCatSet) all = all.filter(c => tournamentCatSet.has(c.id as CategoryEnum));
    return (this.isAdmin() || !assigned.size) ? all : all.filter(c => assigned.has(c.id));
  });

  readonly categoryColumns = ['toggle', 'categoryLabel', 'count', 'total'];
  expandedCategory = signal<EncounterCategorySummary | null>(null);

  constructor() {
    effect(() => {
      const ctrl = this.filterForm.get('date')!;
      const matches = this.allMatches();
      const uniqueDates = new Set(matches.map(m => m.date?.toString().substring(0, 10)));
      (matches.length > 0 && uniqueDates.size <= 1) ? ctrl.disable({ emitEvent: false }) : ctrl.enable({ emitEvent: false });
    });
  }

  toggleCategory(row: EncounterCategorySummary) {
    this.expandedCategory.set(this.expandedCategory() === row ? null : row);
  }

  ngOnInit() {
    this.loadTournaments();
    // Pre-seleccionar deporte si el usuario tiene solo uno asignado
    const sports = this.availableSports();
    if (sports.length === 1) {
      this.filterForm.get('sport')!.setValue(sports[0].value);
    }
    // Cuando cambia el torneo, auto-setear sport y buscar partidos
    this.filterForm.get('tournament')!.valueChanges.subscribe((tournamentId) => {
      const tournament = this.tournaments().find(t => t.id === tournamentId);
      const sports = this.availableSports();
      const effectiveSport = tournament?.sport ?? (sports.length === 1 ? sports[0].value : null);
      this.filterForm.get('sport')!.setValue(effectiveSport);
      if (tournamentId) this.searchEncounters();
    });
    // Re-aplicar filtros cuando cambia sport o category
    this.filterForm.get('sport')!.valueChanges.subscribe(() => {
      this.filterForm.get('category')!.setValue(null);
      this.applyFilters();
    });
    this.filterForm.get('category')!.valueChanges.subscribe(() => this.applyFilters());
    this.filterForm.get('date')!.valueChanges.subscribe(() => this.applyFilters());
  }

  private loadTournaments() {
    this.loadingTournaments.set(true);
    const params = new HttpParams().set('size', '200').set('page', '1');
    this.http.get<PaginatedResponse<Tournament>>(this.tournamentsApiUrl, { params }).subscribe({
      next: (res) => {
        this.tournaments.set(res.items);
        this.loadingTournaments.set(false);
      },
      error: () => this.loadingTournaments.set(false),
    });
  }

  searchEncounters() {
    const { tournament } = this.filterForm.value;
    if (!tournament) return;

    this.loadingEncounters.set(true);
    this.allMatches.set([]);
    this.encounters.set([]);
    this.report.set(null);
    this.selectedEncounter.set(null);

    const params = new HttpParams()
      .set('filters', JSON.stringify({ tournament }))
      .set('size', '200')
      .set('page', '1')
      .set('sortBy', 'date')
      .set('sortOrder', 'desc');

    this.http.get<PaginatedResponse<Match>>(this.matchesApiUrl, { params }).subscribe({
      next: (res) => {
        this.allMatches.set(res.items);
        this.applyFilters();
        this.loadingEncounters.set(false);
      },
      error: () => this.loadingEncounters.set(false),
    });
  }

  private applyFilters() {
    const { sport, category, date } = this.filterForm.getRawValue();
    let matches = this.allMatches();

    if (sport) matches = matches.filter(m => m.sport === sport);
    if (category?.length) matches = matches.filter(m => category.includes(m.category as CategoryEnum));
    if (date) {
      const dateStr = format(date, 'yyyy-MM-dd');
      matches = matches.filter(m => m.date?.toString().substring(0, 10) === dateStr);
    }

    this.encounters.set(this.groupMatchesToEncounters(matches));
    this.report.set(null);
    this.selectedEncounter.set(null);
  }

  private groupMatchesToEncounters(matches: Match[]): EncounterGroup[] {
    const groups = new Map<string, EncounterGroup>();
    for (const m of matches) {
      const key = `${m.date?.toString().substring(0, 10)}_${m.opponent ?? ''}_${m.name ?? ''}`;
      if (!groups.has(key)) {
        const label = m.name || (m.opponent ? `vs ${m.opponent}` : format(new Date(m.date), 'dd/MM/yyyy'));
        groups.set(key, {
          label,
          date: format(new Date(m.date), 'dd/MM/yyyy'),
          time: m.time || undefined,
          opponent: m.opponent || undefined,
          matchIds: [],
          categories: [],
        });
      }
      const group = groups.get(key)!;
      group.matchIds.push(m.id!);
      if (m.category) {
        const catLabel = getCategoryLabel(m.category as CategoryEnum);
        if (!group.categories.includes(catLabel)) group.categories.push(catLabel);
      }
    }
    return Array.from(groups.values());
  }

  selectEncounter(encounter: EncounterGroup) {
    this.selectedEncounter.set(encounter);
    this.report.set(null);
    this.expandedCategory.set(null);
    this.loadingReport.set(true);
    this.paymentsService.getEncounterReport(encounter.matchIds).subscribe({
      next: (data) => {
        this.report.set(data);
        this.loadingReport.set(false);
      },
      error: () => {
        this.snackBar.open('Error al cargar el informe', '', { duration: 3000 });
        this.loadingReport.set(false);
      },
    });
  }

  clearAll() {
    this.filterForm.reset();
    this.encounters.set([]);
    this.report.set(null);
    this.selectedEncounter.set(null);
    this.expandedCategory.set(null);
  }

  async downloadPdf() {
    const r = this.report();
    if (!r) return;
    this.generatingPdf.set(true);
    try {
      await this.pdfService.generate(r);
    } catch {
      this.snackBar.open('Error al generar el PDF', '', { duration: 3000 });
    } finally {
      this.generatingPdf.set(false);
    }
  }
}
