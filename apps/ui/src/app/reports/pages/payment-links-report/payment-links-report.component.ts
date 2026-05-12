import {
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
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
import { debounceTime } from 'rxjs';
import { format } from 'date-fns';
import {
  PaymentEntityTypeEnum,
  PaymentLinkStatusEnum,
  PaymentTypeEnum,
} from '@ltrc-campo/shared-api-model';
import {
  PaymentLinkReportRow,
  PaymentLinksReport,
  PaymentLinksReportFilters,
  PaymentsService,
} from '../../../payments/services/payments.service';

@Component({
  selector: 'ltrc-payment-links-report',
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
    MatSortModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatCardModule,
  ],
  templateUrl: './payment-links-report.component.html',
  styleUrl: './payment-links-report.component.scss',
})
export class PaymentLinksReportComponent implements OnInit {
  private readonly paymentsService = inject(PaymentsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  report = signal<PaymentLinksReport | null>(null);
  loading = signal(false);
  page = signal(1);
  readonly pageSize = 50;
  sortBy = signal('createdAt');
  sortDir = signal<'asc' | 'desc'>('desc');

  readonly filterForm = new FormGroup({
    status: new FormControl<PaymentLinkStatusEnum[]>([]),
    entityType: new FormControl<PaymentEntityTypeEnum[]>([]),
    concept: new FormControl<string[]>([]),
    dateFrom: new FormControl<Date | null>(null),
    dateTo: new FormControl<Date | null>(null),
  });

  concepts = signal<string[]>([]);

  readonly statusOptions = [
    { value: PaymentLinkStatusEnum.ACTIVE, label: 'Activo' },
    { value: PaymentLinkStatusEnum.EXPIRED, label: 'Vencido' },
    { value: PaymentLinkStatusEnum.CANCELLED, label: 'Cancelado' },
  ];

  readonly entityTypeOptions = [
    { value: PaymentEntityTypeEnum.MATCH, label: 'Partido' },
    { value: PaymentEntityTypeEnum.TRIP, label: 'Viaje' },
    { value: PaymentEntityTypeEnum.PLAYER_FEE, label: 'Derecho de jugador' },
  ];

  readonly columns = ['createdAt', 'entityType', 'entity', 'concept', 'amount', 'paymentType', 'expiresAt', 'status', 'actions'];

  readonly activeFilterCount = computed(() => {
    const v = this.filterForm.value;
    let n = 0;
    if (v.status?.length) n++;
    if (v.entityType?.length) n++;
    if (v.concept?.length) n++;
    if (v.dateFrom) n++;
    if (v.dateTo) n++;
    return n;
  });

  ngOnInit() {
    this.loadConcepts();

    this.filterForm.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.search());

    this.search();
  }

  private loadConcepts() {
    this.paymentsService
      .getFieldOptions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (opts) => this.concepts.set(opts.concepts) });
  }

  private buildFilters(): PaymentLinksReportFilters {
    const v = this.filterForm.value;
    return {
      status: v.status?.length ? v.status.join(',') : undefined,
      entityType: v.entityType?.length ? v.entityType.join(',') : undefined,
      concept: v.concept?.length ? v.concept.join(',') : undefined,
      dateFrom: v.dateFrom ? format(v.dateFrom, 'yyyy-MM-dd') : undefined,
      dateTo: v.dateTo ? format(v.dateTo, 'yyyy-MM-dd') : undefined,
      sortBy: this.sortBy(),
      sortDir: this.sortDir(),
    };
  }

  search(resetPage = true) {
    if (resetPage) this.page.set(1);
    this.loading.set(true);
    this.paymentsService
      .getAllLinks({ ...this.buildFilters(), page: this.page(), limit: this.pageSize })
      .subscribe({
        next: (data) => {
          this.report.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.snackBar.open('Error al cargar los links', '', { duration: 3000 });
          this.loading.set(false);
        },
      });
  }

  onPageChange(event: PageEvent) {
    this.page.set(event.pageIndex + 1);
    this.search(false);
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
    ctrl.setValue(Array.isArray(ctrl.value) ? [] : null);
  }

  clearFilters() {
    this.filterForm.reset();
    this.search();
  }

  copyLink(row: PaymentLinkReportRow) {
    const url = `${window.location.origin}/pay/${row.linkToken}`;
    navigator.clipboard.writeText(url).then(() => {
      this.snackBar.open('Link copiado al portapapeles', '', { duration: 2500 });
    });
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      active: 'Activo',
      expired: 'Vencido',
      cancelled: 'Cancelado',
    };
    return labels[status] ?? status;
  }

  entityTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      [PaymentEntityTypeEnum.MATCH]: 'Partido',
      [PaymentEntityTypeEnum.TRIP]: 'Viaje',
      [PaymentEntityTypeEnum.PLAYER_FEE]: 'Derecho',
    };
    return labels[type] ?? type;
  }

  paymentTypeLabel(row: PaymentLinkReportRow): string {
    if (row.paymentType === PaymentTypeEnum.INSTALLMENT && row.installmentNumber && row.installmentTotal) {
      return `Cuota ${row.installmentNumber}/${row.installmentTotal}`;
    }
    const labels: Record<string, string> = {
      [PaymentTypeEnum.FULL]: 'Completo',
      [PaymentTypeEnum.PARTIAL]: 'Parcial',
      [PaymentTypeEnum.INSTALLMENT]: 'Cuota',
    };
    return labels[row.paymentType] ?? row.paymentType;
  }

  trackById(_: number, row: PaymentLinkReportRow): string {
    return row.id;
  }
}
