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
import { HttpClient, HttpParams } from '@angular/common/http';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { debounceTime, startWith } from 'rxjs';
import { format } from 'date-fns';
import {
  CategoryEnum,
  PaymentEntityTypeEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  PaginatedResponse,
  RoleEnum,
  SportEnum,
  Tournament,
} from '@ltrc-campo/shared-api-model';
import { getCategoryLabel, getCategoryOptionsBySport } from '../../../common/category-options';
import { API_CONFIG_TOKEN } from '../../../app.config';
import { AuthService } from '../../../auth/auth.service';
import {
  GlobalPaymentRow,
  GlobalPaymentsReport,
  GlobalReportFilters,
  PaymentsService,
} from '../../../payments/services/payments.service';
import {
  PaymentsReportPdfService,
  PaymentsReportPdfContext,
} from '../../services/payments-report-pdf.service';

@Component({
  selector: 'ltrc-payments-report',
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
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSortModule,
    MatChipsModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatCardModule,
  ],
  templateUrl: './payments-report.component.html',
  styleUrl: './payments-report.component.scss',
})
export class PaymentsReportComponent implements OnInit {
  private readonly paymentsService = inject(PaymentsService);
  private readonly pdfService = inject(PaymentsReportPdfService);
  private readonly authService = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG_TOKEN);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  private readonly currentUser = toSignal(this.authService.user$);
  private readonly isAdmin = computed(
    () => this.currentUser()?.roles?.includes(RoleEnum.ADMIN) ?? false
  );

  tournaments = signal<Tournament[]>([]);
  loadingTournaments = signal(false);
  report = signal<GlobalPaymentsReport | null>(null);
  loading = signal(false);
  generatingPdf = signal(false);
  page = signal(1);
  readonly pageSize = 50;
  sortBy = signal('date');
  sortDir = signal<'asc' | 'desc'>('desc');

  readonly filterForm = new FormGroup({
    tournament: new FormControl<string | null>(null),
    status: new FormControl<PaymentStatusEnum[]>([]),
    method: new FormControl<PaymentMethodEnum[]>([]),
    concept: new FormControl<string[]>([]),
    sport: new FormControl<SportEnum | null>(null),
    category: new FormControl<CategoryEnum | null>(null),
    dateFrom: new FormControl<Date | null>(null),
    dateTo: new FormControl<Date | null>(null),
  });

  concepts = signal<string[]>([]);

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

  readonly showCategory = computed(() => this.availableCategories().length > 1);

  readonly filteredTournaments = computed(() => {
    const sport = this.selectedSport();
    const all = this.tournaments();
    return sport ? all.filter((t) => !t.sport || t.sport === sport) : all;
  });

  readonly columns = ['date', 'player', 'sport', 'entity', 'concept', 'method', 'amount', 'status'];

  readonly statusOptions = [
    { value: PaymentStatusEnum.APPROVED, label: 'Aprobado' },
    { value: PaymentStatusEnum.PENDING, label: 'Pendiente' },
    { value: PaymentStatusEnum.IN_PROCESS, label: 'En proceso' },
    { value: PaymentStatusEnum.REJECTED, label: 'Rechazado' },
    { value: PaymentStatusEnum.CANCELLED, label: 'Cancelado' },
  ];

  readonly methodOptions = [
    { value: PaymentMethodEnum.MERCADOPAGO, label: 'Mercado Pago' },
    { value: PaymentMethodEnum.CASH, label: 'Efectivo' },
    { value: PaymentMethodEnum.TRANSFER, label: 'Transferencia' },
  ];

  ngOnInit() {
    // Pre-seleccionar deporte si el usuario tiene solo uno asignado
    const sports = this.availableSports();
    if (sports.length === 1) {
      this.filterForm.get('sport')!.setValue(sports[0].value, { emitEvent: false });
    }

    this.filterForm.get('sport')!.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.filterForm.get('category')!.setValue(null, { emitEvent: false });
        this.filterForm.get('tournament')!.setValue(null, { emitEvent: false });
      });

    this.filterForm.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.search());

    this.loadTournaments();
    this.loadConcepts();
    this.search();
  }

  private loadConcepts() {
    this.paymentsService.getFieldOptions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (opts) => this.concepts.set(opts.concepts) });
  }

  private loadTournaments() {
    this.loadingTournaments.set(true);
    const params = new HttpParams().set('size', '200').set('page', '1');
    this.http
      .get<PaginatedResponse<Tournament>>(`${this.config.baseUrl}/tournaments`, { params })
      .subscribe({
        next: (res) => {
          this.tournaments.set(res.items);
          this.loadingTournaments.set(false);
        },
        error: () => this.loadingTournaments.set(false),
      });
  }

  private buildFilters(): GlobalReportFilters {
    const v = this.filterForm.value;
    return {
      tournamentId: v.tournament ?? undefined,
      status: v.status?.length ? v.status.join(',') : undefined,
      method: v.method?.length ? v.method.join(',') : undefined,
      concept: v.concept?.length ? v.concept.join(',') : undefined,
      sport: v.sport ?? undefined,
      category: v.category ?? undefined,
      dateFrom: v.dateFrom ? format(v.dateFrom, 'yyyy-MM-dd') : undefined,
      dateTo: v.dateTo ? format(v.dateTo, 'yyyy-MM-dd') : undefined,
      sortBy: this.sortBy(),
      sortDir: this.sortDir(),
    };
  }

  onSortChange(event: { active: string; direction: string }) {
    if (!event.direction) return;
    this.sortBy.set(event.active);
    this.sortDir.set(event.direction as 'asc' | 'desc');
    this.search();
  }

  clearControl(name: string) {
    const ctrl = this.filterForm.get(name);
    if (!ctrl) return;
    const isMulti = Array.isArray(ctrl.value);
    ctrl.setValue(isMulti ? [] : null);
  }

  private selectedTournamentName(): string | null {
    const id = this.filterForm.get('tournament')!.value;
    return id ? (this.tournaments().find((t) => t.id === id)?.name ?? null) : null;
  }

  search(resetPage = true) {
    if (resetPage) this.page.set(1);
    this.loading.set(true);

    this.paymentsService
      .getGlobalReport({ ...this.buildFilters(), page: this.page(), limit: this.pageSize })
      .subscribe({
        next: (data) => {
          this.report.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.snackBar.open('Error al cargar los pagos', '', { duration: 3000 });
          this.loading.set(false);
        },
      });
  }

  onPageChange(event: PageEvent) {
    this.page.set(event.pageIndex + 1);
    this.search(false);
  }

  clearFilters() {
    this.filterForm.reset();
    this.search();
  }

  downloadPdf() {
    this.generatingPdf.set(true);
    const filters = this.buildFilters();
    this.paymentsService
      .getGlobalReport({ ...filters, page: 1, limit: 1000 })
      .subscribe({
        next: async (allData) => {
          const ctx = this.buildPdfContext(filters);
          try {
            await this.pdfService.generate(allData, ctx);
          } catch {
            this.snackBar.open('Error al generar el PDF', '', { duration: 3000 });
          } finally {
            this.generatingPdf.set(false);
          }
        },
        error: () => {
          this.snackBar.open('Error al cargar los datos para el PDF', '', { duration: 3000 });
          this.generatingPdf.set(false);
        },
      });
  }

  private buildPdfContext(filters: GlobalReportFilters): PaymentsReportPdfContext {
    const v = this.filterForm.value;
    return {
      sport: v.sport ?? null,
      category: v.category ?? null,
      tournamentName: this.selectedTournamentName(),
      statusLabel: v.status?.length
        ? v.status.map((s) => this.statusLabel(s)).join(', ')
        : null,
      methodLabel: v.method?.length
        ? v.method.map((m) => this.methodLabel(m)).join(', ')
        : null,
      dateFrom: filters.dateFrom ?? null,
      dateTo: filters.dateTo ?? null,
    };
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      approved: 'Aprobado',
      pending: 'Pendiente',
      in_process: 'En proceso',
      rejected: 'Rechazado',
      cancelled: 'Cancelado',
    };
    return labels[status] ?? status;
  }

  methodLabel(method: string): string {
    const labels: Record<string, string> = {
      [PaymentMethodEnum.CASH]: 'Efectivo',
      [PaymentMethodEnum.TRANSFER]: 'Transferencia',
      [PaymentMethodEnum.MERCADOPAGO]: 'Mercado Pago',
    };
    return labels[method] ?? method;
  }

  getCategoryLabel(cat: string | null): string {
    if (!cat) return '—';
    return getCategoryLabel(cat as CategoryEnum);
  }

  sportLabel(sport: string | null): string {
    if (!sport) return '—';
    return sport === SportEnum.RUGBY ? 'Rugby' : 'Hockey';
  }

  readonly activeFilterCount = computed(() => {
    const v = this.filterForm.value;
    let n = 0;
    if (v.tournament) n++;
    if (v.status?.length) n++;
    if (v.method?.length) n++;
    if (v.concept?.length) n++;
    if (v.sport && this.showSport()) n++;
    if (v.category) n++;
    if (v.dateFrom) n++;
    if (v.dateTo) n++;
    return n;
  });

  trackById(_: number, row: GlobalPaymentRow): string {
    return row.id;
  }
}
