import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { PaymentsService } from '../../services/payments.service';
import { CategoryEnum, IPaymentLinkPublicInfo } from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../../common/category-options';

type PageState = 'loading' | 'ready' | 'validating' | 'validated' | 'redirecting' | 'expired' | 'error';

@Component({
  selector: 'ltrc-payment-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatIconModule,
  ],
  templateUrl: './payment-page.component.html',
  styleUrl: './payment-page.component.scss',
})
export class PaymentPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly paymentsService = inject(PaymentsService);

  readonly getCategoryLabel = getCategoryLabel;

  state: PageState = 'loading';
  linkInfo: IPaymentLinkPublicInfo | null = null;
  playerName = '';
  errorMessage = '';
  dniRejected = false;

  dniControl = new FormControl('', [
    Validators.required,
    Validators.minLength(6),
    Validators.pattern(/^\d+$/),
  ]);

  ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    this.paymentsService.getPublicLinkInfo(token).subscribe({
      next: (info) => {
        this.linkInfo = info;
        this.state = 'ready';
      },
      error: (err) => {
        if (err.status === 410) {
          this.state = 'expired';
          this.errorMessage = err.error?.message ?? 'Este link ha expirado o fue cancelado.';
        } else {
          this.state = 'error';
          this.errorMessage = 'No se pudo cargar la información del cobro.';
        }
      },
    });
  }

  validateDni() {
    if (this.dniControl.invalid || !this.linkInfo || this.dniRejected) return;
    this.state = 'validating';
    this.errorMessage = '';
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    this.paymentsService.validateDni(token, this.dniControl.value!).subscribe({
      next: (result) => {
        this.playerName = result.playerName;
        this.state = 'validated';
      },
      error: (err) => {
        this.state = 'ready';
        this.dniRejected = true;
        if (err.status === 404) {
          this.errorMessage = 'No se encontró ninguna persona con ese DNI.';
        } else {
          this.errorMessage = this.resolveDniError(err.error);
        }
      },
    });
  }

  resetDni(): void {
    this.dniControl.reset();
    this.dniRejected = false;
    this.errorMessage = '';
    this.state = 'ready';
  }

  pay() {
    if (!this.linkInfo) return;
    this.state = 'redirecting';
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    this.paymentsService.initiateCheckout(token, this.dniControl.value!).subscribe({
      next: (result) => {
        window.location.href = result.checkoutUrl;
      },
      error: () => {
        this.state = 'validated';
        this.errorMessage = 'Error al iniciar el pago. Intente nuevamente.';
      },
    });
  }

  private resolveDniError(body: any): string {
    if (body?.code === 'NOT_A_PARTICIPANT') {
      return 'El DNI ingresado no corresponde a ningún participante de este viaje.';
    }
    if (body?.code === 'NO_PAYMENT_REQUIRED') {
      return 'Este participante no tiene costo asignado en el viaje.';
    }
    if (body?.code === 'CATEGORY_MISMATCH') {
      const player = getCategoryLabel(body.playerCategory as CategoryEnum);
      const match = getCategoryLabel(body.matchCategory as CategoryEnum);
      return `La categoría del DNI ingresado es ${player}, pero este partido es de ${match}.`;
    }
    if (body?.code === 'CATEGORY_NOT_IN_GROUP') {
      const player = getCategoryLabel(body.playerCategory as CategoryEnum);
      return `La categoría del DNI ingresado es ${player}, que no está incluida en este encuentro.`;
    }
    return body?.message ?? 'Error al validar el DNI. Intente nuevamente.';
  }

  get installmentLabel(): string {
    if (!this.linkInfo) return '';
    if (this.linkInfo.installmentNumber && this.linkInfo.installmentTotal) {
      return `Cuota ${this.linkInfo.installmentNumber} de ${this.linkInfo.installmentTotal}`;
    }
    if (this.linkInfo.paymentType === 'partial') return 'Pago parcial';
    return 'Pago total';
  }
}
