import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { PaymentsService } from '../../services/payments.service';
import { CreatePaymentLinkDialogComponent } from '../create-payment-link-dialog/create-payment-link-dialog.component';
import { RecordManualPaymentDialogComponent } from '../record-manual-payment-dialog/record-manual-payment-dialog.component';
import {
  IPayment,
  IPaymentLink,
  PaymentEntityTypeEnum,
  PaymentLinkStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
  RoleEnum,
} from '@ltrc-campo/shared-api-model';

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  [PaymentTypeEnum.FULL]: 'Pago total',
  [PaymentTypeEnum.PARTIAL]: 'Pago parcial',
  [PaymentTypeEnum.INSTALLMENT]: 'Cuota',
};
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';

@Component({
  selector: 'ltrc-payment-links-panel',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatTableModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatMenuModule,
    AllowedRolesDirective,
  ],
  templateUrl: './payment-links-panel.component.html',
  styleUrl: './payment-links-panel.component.scss',
})
export class PaymentLinksPanelComponent implements OnInit {
  readonly paymentTypeLabel = (type: string) => PAYMENT_TYPE_LABELS[type] ?? type;
  @Input({ required: true }) entityId!: string;
  @Input() entityType: PaymentEntityTypeEnum = PaymentEntityTypeEnum.MATCH;
  @Input() entityDate?: Date;
  @Input() entityLabel?: string;

  private readonly paymentsService = inject(PaymentsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  links: IPaymentLink[] = [];
  payments: IPayment[] = [];
  loading = signal(true);
  syncingId = signal<string | null>(null);

  readonly linkColumns = ['concept', 'amount', 'type', 'expires', 'status', 'actions'];
  readonly paymentColumns = ['player', 'concept', 'method', 'amount', 'date', 'status', 'actions'];

  readonly PaymentLinkStatusEnum = PaymentLinkStatusEnum;
  readonly RoleEnum = RoleEnum;
  readonly PaymentMethodEnum = PaymentMethodEnum;
  readonly PaymentStatusEnum = PaymentStatusEnum;

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loading.set(true);
    this.paymentsService.getLinks(this.entityType, this.entityId).subscribe({
      next: (links) => (this.links = links),
    });
    this.paymentsService.getPayments(this.entityType, this.entityId).subscribe({
      next: (payments) => {
        this.payments = payments;
        this.loading.set(false);
      },
      error: () => (this.loading.set(false)),
    });
  }

  openCreateLinkDialog() {
    const ref = this.dialog.open(CreatePaymentLinkDialogComponent, {
      width: '480px',
      data: { entityType: this.entityType, entityId: this.entityId, entityDate: this.entityDate, entityLabel: this.entityLabel },
    });
    ref.afterClosed().subscribe((created) => {
      if (created) this.loadAll();
    });
  }

  openRecordManualDialog() {
    const ref = this.dialog.open(RecordManualPaymentDialogComponent, {
      width: '480px',
      data: { entityType: this.entityType, entityId: this.entityId },
    });
    ref.afterClosed().subscribe((created) => {
      if (created) this.loadAll();
    });
  }

  getLinkUrl(link: IPaymentLink): string {
    return `${window.location.origin}/pay/${link.linkToken}`;
  }

  copyLink(link: IPaymentLink) {
    navigator.clipboard.writeText(this.getLinkUrl(link)).then(() => {
      this.snackBar.open('Link copiado al portapapeles', '', { duration: 2500 });
    });
  }

  shareWhatsApp(link: IPaymentLink) {
    const url = this.getLinkUrl(link);
    const parts = [link.concept, link.description].filter(Boolean).join(' — ');
    const text = encodeURIComponent(`${parts}:\n${url}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  cancelLink(link: IPaymentLink) {
    this.paymentsService.cancelLink(link.id).subscribe(() => this.loadAll());
  }

  deletePayment(payment: IPayment) {
    this.paymentsService.deleteManual(payment.id).subscribe(() => this.loadAll());
  }

  syncPayment(payment: IPayment) {
    this.syncingId.set(payment.id);
    this.paymentsService.syncPayment(payment.id).subscribe({
      next: (result) => {
        this.syncingId.set(null);
        if (result.updated) {
          this.snackBar.open('Estado actualizado', '', { duration: 2500 });
          this.loadAll();
        } else {
          this.snackBar.open('Sin cambios en MercadoPago', '', { duration: 2500 });
        }
      },
      error: () => {
        this.syncingId.set(null);
        this.snackBar.open('Error al consultar MercadoPago', '', { duration: 3000 });
      },
    });
  }

  downloadPdf() {
    this.paymentsService.downloadPdfReport(this.entityType, this.entityId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cobros-${this.entityType}-${this.entityId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snackBar.open('Error al generar el reporte', '', { duration: 3000 }),
    });
  }

  get totalApproved(): number {
    return this.payments
      .filter((p) => p.status === PaymentStatusEnum.APPROVED)
      .reduce((s, p) => s + p.amount, 0);
  }

  statusLabel(status: PaymentStatusEnum | PaymentLinkStatusEnum): string {
    const labels: Record<string, string> = {
      approved: 'Aprobado',
      pending: 'Pendiente',
      in_process: 'En proceso',
      rejected: 'Rechazado',
      cancelled: 'Cancelado',
      active: 'Activo',
      expired: 'Expirado',
    };
    return labels[status] ?? status;
  }

  methodLabel(method: PaymentMethodEnum): string {
    const labels: Record<PaymentMethodEnum, string> = {
      [PaymentMethodEnum.CASH]: 'Efectivo',
      [PaymentMethodEnum.TRANSFER]: 'Transferencia',
      [PaymentMethodEnum.MERCADOPAGO]: 'Mercado Pago',
    };
    return labels[method];
  }
}
