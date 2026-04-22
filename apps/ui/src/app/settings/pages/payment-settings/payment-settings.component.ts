import { Component, inject, OnInit, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { PaymentsService } from '../../../payments/services/payments.service';

interface PaymentMethodOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  enabled: boolean;
}

@Component({
  selector: 'ltrc-payment-settings',
  standalone: true,
  imports: [
    MatCardModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  templateUrl: './payment-settings.component.html',
  styleUrl: './payment-settings.component.scss',
})
export class PaymentSettingsComponent implements OnInit {
  private readonly paymentsService = inject(PaymentsService);
  private readonly snackBar = inject(MatSnackBar);

  loading = signal(true);
  saving = signal(false);

  readonly methods = signal<PaymentMethodOption[]>([
    { id: 'credit_card', label: 'Tarjeta de crédito', description: 'Visa, Mastercard, American Express', icon: 'credit_card', enabled: true },
    { id: 'debit_card', label: 'Tarjeta de débito', description: 'Visa Débito, Maestro', icon: 'payment', enabled: true },
    { id: 'account_money', label: 'Dinero en cuenta MP', description: 'Saldo disponible en cuenta MercadoPago', icon: 'account_balance_wallet', enabled: true },
    { id: 'bank_transfer', label: 'Transferencia bancaria (CBU/CVU)', description: 'Pago desde cuenta bancaria vinculada', icon: 'account_balance', enabled: true },
    { id: 'ticket', label: 'Efectivo', description: 'Rapipago, Pago Fácil y otros puntos de pago', icon: 'store', enabled: true },
  ]);

  ngOnInit() {
    this.paymentsService.getConfig().subscribe({
      next: ({ excludedPaymentTypes }) => {
        this.methods.update((list) =>
          list.map((m) => ({ ...m, enabled: !excludedPaymentTypes.includes(m.id) }))
        );
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  toggle(id: string) {
    this.methods.update((list) =>
      list.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
    );
    this.save();
  }

  private save() {
    this.saving.set(true);
    const excluded = this.methods()
      .filter((m) => !m.enabled)
      .map((m) => m.id);

    this.paymentsService.updatePaymentConfig(excluded).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open('Configuración guardada', '', { duration: 2000 });
      },
      error: () => {
        this.saving.set(false);
        this.snackBar.open('Error al guardar', '', { duration: 3000 });
      },
    });
  }
}
