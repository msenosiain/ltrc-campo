import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatChipsModule } from '@angular/material/chips';
import { debounceTime } from 'rxjs';
import { format } from 'date-fns';
import {
  IPlayerFeeConfig,
  PaymentEntityTypeEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../../common/category-options';
import { GlobalPaymentsReport, PaymentsService } from '../../../payments/services/payments.service';
import { PlayerFeesAdminService } from '../../../player-fees/services/player-fees-admin.service';

@Component({
  selector: 'ltrc-player-fees-report',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
  ],
  templateUrl: './player-fees-report.component.html',
  styleUrl: './player-fees-report.component.scss',
})
export class PlayerFeesReportComponent implements OnInit {
  private readonly paymentsService = inject(PaymentsService);
  private readonly feesAdminService = inject(PlayerFeesAdminService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  configs = signal<IPlayerFeeConfig[]>([]);
  report = signal<GlobalPaymentsReport | null>(null);
  loading = signal(false);
  page = signal(1);
  readonly pageSize = 50;
  sortBy = signal('date');
  sortDir = signal<'asc' | 'desc'>('desc');

  readonly filterForm = new FormGroup({
    concept:  new FormControl<string[]>([]),
    sport:    new FormControl<SportEnum | null>(null),
    status:   new FormControl<PaymentStatusEnum[]>([]),
    method:   new FormControl<PaymentMethodEnum[]>([]),
    dateFrom: new FormControl<Date | null>(null),
    dateTo:   new FormControl<Date | null>(null),
  });

  readonly statusOptions = [
    { value: PaymentStatusEnum.APPROVED,   label: 'Aprobado' },
    { value: PaymentStatusEnum.PENDING,    label: 'Pendiente' },
    { value: PaymentStatusEnum.REJECTED,   label: 'Rechazado' },
    { value: PaymentStatusEnum.CANCELLED,  label: 'Cancelado' },
  ];

  readonly sportOptions = [
    { value: SportEnum.RUGBY,  label: 'Rugby' },
    { value: SportEnum.HOCKEY, label: 'Hockey' },
  ];

  readonly methodOptions: Record<string, string> = {
    [PaymentMethodEnum.MERCADOPAGO]: 'Mercado Pago',
    [PaymentMethodEnum.CASH]:        'Efectivo',
    [PaymentMethodEnum.TRANSFER]:    'Transferencia',
  };

  readonly columns = ['date', 'player', 'category', 'concept', 'method', 'amount', 'status'];

  readonly activeFilterCount = computed(() => {
    const v = this.filterForm.value;
    let n = 0;
    if (v.concept?.length) n++;
    if (v.sport) n++;
    if (v.status?.length) n++;
    if (v.method?.length) n++;
    if (v.dateFrom) n++;
    if (v.dateTo) n++;
    return n;
  });

  ngOnInit(): void {
    this.feesAdminService.getConfigs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (cs: IPlayerFeeConfig[]) => this.configs.set(cs) });

    this.filterForm.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.search());

    this.search();
  }

  search(resetPage = true): void {
    if (resetPage) this.page.set(1);
    this.loading.set(true);
    const v = this.filterForm.value;

    this.paymentsService.getGlobalReport({
      entityType: PaymentEntityTypeEnum.PLAYER_FEE,
      concept:    v.concept?.length  ? v.concept.join(',')  : undefined,
      sport:      v.sport            ?? undefined,
      status:     v.status?.length   ? v.status.join(',')   : undefined,
      method:     v.method?.length   ? v.method.join(',')   : undefined,
      dateFrom:   v.dateFrom ? format(v.dateFrom, 'yyyy-MM-dd') : undefined,
      dateTo:     v.dateTo   ? format(v.dateTo,   'yyyy-MM-dd') : undefined,
      sortBy:     this.sortBy(),
      sortDir:    this.sortDir(),
      page:       this.page(),
      limit:      this.pageSize,
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next:  (r) => { this.report.set(r); this.loading.set(false); },
        error: () => {
          this.snackBar.open('Error al cargar el reporte', '', { duration: 3000 });
          this.loading.set(false);
        },
      });
  }

  onPageChange(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.search(false);
  }

  onSortChange(e: { active: string; direction: string }): void {
    if (!e.direction) return;
    this.sortBy.set(e.active);
    this.sortDir.set(e.direction as 'asc' | 'desc');
    this.search();
  }

  clearControl(name: string): void {
    const ctrl = this.filterForm.get(name);
    if (!ctrl) return;
    ctrl.setValue(Array.isArray(ctrl.value) ? [] : null);
  }

  clearFilters(): void {
    this.filterForm.reset();
    this.search();
  }

  statusLabel(s: string): string {
    return this.statusOptions.find((o) => o.value === s)?.label ?? s;
  }

  methodLabel(m: string): string {
    return this.methodOptions[m] ?? m;
  }

  getCategoryLabel = getCategoryLabel;
}
