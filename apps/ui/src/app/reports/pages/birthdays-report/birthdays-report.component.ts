import {
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, startWith } from 'rxjs';
import {
  CategoryEnum,
  Player,
  PlayerStatusEnum,
  RoleEnum,
  SortOrder,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import { getCategoryLabel, getCategoryOptionsBySport } from '../../../common/category-options';
import { AuthService } from '../../../auth/auth.service';
import { PlayersService } from '../../../players/services/players.service';
import {
  BirthdayRow,
  BirthdaysReportPdfService,
} from '../../services/birthdays-report-pdf.service';

@Component({
  selector: 'ltrc-birthdays-report',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatCardModule,
    MatTooltipModule,
  ],
  templateUrl: './birthdays-report.component.html',
  styleUrl: './birthdays-report.component.scss',
})
export class BirthdaysReportComponent implements OnInit {
  private readonly playersService = inject(PlayersService);
  private readonly pdfService = inject(BirthdaysReportPdfService);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  private readonly currentUser = toSignal(this.authService.user$);
  private readonly isAdmin = computed(
    () => this.currentUser()?.roles?.includes(RoleEnum.ADMIN) ?? false
  );

  rows = signal<BirthdayRow[]>([]);
  loading = signal(false);
  generatingPdf = signal(false);

  readonly filterForm = new FormGroup({
    sport: new FormControl<SportEnum | null>(null),
    categories: new FormControl<CategoryEnum[]>([]),
    status: new FormControl<PlayerStatusEnum | null>(PlayerStatusEnum.ACTIVE),
  });

  private readonly selectedSport = toSignal(
    this.filterForm.get('sport')!.valueChanges.pipe(startWith(null as SportEnum | null))
  );

  readonly availableSports = computed(() => {
    const user = this.currentUser();
    const assigned = user?.sports ?? [];
    const all = Object.values(SportEnum);
    const sports = this.isAdmin() || !assigned.length ? all : assigned;
    return sports.map((v) => ({
      value: v,
      label: v === SportEnum.RUGBY ? 'Rugby' : 'Hockey',
    }));
  });

  readonly showSport = computed(() => this.availableSports().length > 1);

  readonly availableCategories = computed(() => {
    const user = this.currentUser();
    const assigned = new Set(user?.categories ?? []);
    const sport = this.selectedSport() ?? null;
    const all = getCategoryOptionsBySport(sport);
    return this.isAdmin() || !assigned.size
      ? all
      : all.filter((c) => assigned.has(c.id));
  });

  readonly columns = ['name', 'category', 'birthDate', 'age', 'daysToNext'];

  readonly statusOptions = [
    { value: null, label: 'Todos' },
    { value: PlayerStatusEnum.ACTIVE, label: 'Activos' },
    { value: PlayerStatusEnum.TRIAL, label: 'En prueba' },
    { value: PlayerStatusEnum.INACTIVE, label: 'Inactivos' },
  ];

  readonly activeFilterCount = computed(() => {
    const v = this.filterForm.value;
    let n = 0;
    if (v.sport && this.showSport()) n++;
    if (v.categories?.length) n++;
    if (v.status !== PlayerStatusEnum.ACTIVE) n++;
    return n;
  });

  ngOnInit() {
    const sports = this.availableSports();
    if (sports.length === 1) {
      this.filterForm.get('sport')!.setValue(sports[0].value, { emitEvent: false });
    }

    this.filterForm.get('sport')!.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.filterForm.get('categories')!.setValue([], { emitEvent: false });
      });

    this.filterForm.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.search());

    this.search();
  }

  search() {
    const v = this.filterForm.value;
    this.loading.set(true);

    this.playersService
      .getPlayers({
        page: 1,
        size: 500,
        filters: {
          ...(v.sport ? { sport: v.sport } : {}),
          ...(v.categories?.length ? { categories: v.categories } : {}),
          ...(v.status ? { status: v.status } : {}),
        },
        sortBy: 'name',
        sortOrder: SortOrder.ASC,
      })
      .subscribe({
        next: (res) => {
          this.rows.set(this.toRows(res.items));
          this.loading.set(false);
        },
        error: () => {
          this.snackBar.open('Error al cargar jugadores', '', { duration: 3000 });
          this.loading.set(false);
        },
      });
  }

  private toRows(players: Player[]): BirthdayRow[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return players
      .filter((p) => p.birthDate)
      .map((p) => {
        const birth = new Date(p.birthDate);
        return {
          id: p.id ?? '',
          name: p.name,
          sport: p.sport,
          category: p.category,
          birthDate: birth,
          age: this.calcAge(birth, today),
          daysToNext: this.calcDaysToNext(birth, today),
        };
      })
      .sort((a, b) => a.daysToNext - b.daysToNext);
  }

  private calcAge(birth: Date, today: Date): number {
    let age = today.getFullYear() - birth.getUTCFullYear();
    const m = today.getMonth() - birth.getUTCMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getUTCDate())) age--;
    return age;
  }

  private calcDaysToNext(birth: Date, today: Date): number {
    const next = new Date(today.getFullYear(), birth.getUTCMonth(), birth.getUTCDate());
    if (next.getTime() < today.getTime()) {
      next.setFullYear(today.getFullYear() + 1);
    }
    return Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  clearControl(name: string) {
    const ctrl = this.filterForm.get(name);
    if (!ctrl) return;
    ctrl.setValue(Array.isArray(ctrl.value) ? [] : null);
  }

  clearFilters() {
    this.filterForm.patchValue({ sport: null, categories: [], status: PlayerStatusEnum.ACTIVE });
  }

  getCategoryLabel(cat: CategoryEnum | undefined): string {
    return cat ? getCategoryLabel(cat) : '—';
  }

  sportLabel(sport: SportEnum | undefined): string {
    if (!sport) return '';
    return sport === SportEnum.RUGBY ? 'Rugby' : 'Hockey';
  }

  formatBirthDate(date: Date): string {
    return date.toLocaleDateString('es-AR', { timeZone: 'UTC' });
  }

  daysLabel(days: number): string {
    if (days === 0) return '¡Hoy!';
    if (days === 1) return 'Mañana';
    return `en ${days} días`;
  }

  async downloadPdf() {
    this.generatingPdf.set(true);
    const v = this.filterForm.value;
    try {
      await this.pdfService.generate(this.rows(), {
        sport: v.sport ?? null,
        categories: v.categories ?? [],
      });
    } catch {
      this.snackBar.open('Error al generar el PDF', '', { duration: 3000 });
    } finally {
      this.generatingPdf.set(false);
    }
  }

  trackById(_: number, row: BirthdayRow): string {
    return row.id;
  }
}