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
import { PlayerFeesPublicService } from '../../services/player-fees.service';
import { IPlayerFeePublicInfo, IPlayerFeeValidateResult } from '@ltrc-campo/shared-api-model';

type PageState = 'loading' | 'ready' | 'validating' | 'validated' | 'paid' | 'redirecting' | 'expired' | 'error';

@Component({
  selector: 'ltrc-player-fee-page',
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
  templateUrl: './player-fee-page.component.html',
  styleUrl: './player-fee-page.component.scss',
})
export class PlayerFeePageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(PlayerFeesPublicService);

  state: PageState = 'loading';
  linkInfo: IPlayerFeePublicInfo | null = null;
  validateResult: IPlayerFeeValidateResult | null = null;
  errorMessage = '';

  dniControl = new FormControl('', [
    Validators.required,
    Validators.minLength(6),
    Validators.pattern(/^\d+$/),
  ]);

  ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    this.service.getPublicInfo(token).subscribe({
      next: (info) => {
        this.linkInfo = info;
        this.state = 'ready';
      },
      error: (err) => {
        if (err.status === 400) {
          this.state = 'expired';
          this.errorMessage = err.error?.message ?? 'Este link ha expirado.';
        } else if (err.status === 404) {
          this.state = 'error';
          this.errorMessage = 'Link no encontrado o inactivo.';
        } else {
          this.state = 'error';
          this.errorMessage = 'No se pudo cargar la información del pago.';
        }
      },
    });
  }

  validateDni() {
    if (this.dniControl.invalid || !this.linkInfo) return;
    this.state = 'validating';
    this.errorMessage = '';
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    this.service.validateDni(token, this.dniControl.value!).subscribe({
      next: (result) => {
        this.validateResult = result;
        this.state = result.alreadyPaid ? 'paid' : 'validated';
      },
      error: (err) => {
        this.state = 'ready';
        if (err.status === 404) {
          this.dniControl.setErrors({ notFound: true });
        } else {
          this.errorMessage = err.error?.message ?? 'Error al validar el DNI.';
        }
      },
    });
  }

  pay() {
    if (!this.linkInfo || !this.validateResult) return;
    this.state = 'redirecting';
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    this.service.initiateCheckout(token, this.dniControl.value!).subscribe({
      next: (result) => {
        window.location.href = result.checkoutUrl;
      },
      error: () => {
        this.state = 'validated';
        this.errorMessage = 'Error al iniciar el pago. Intente nuevamente.';
      },
    });
  }

  formatMoney(amount: number): string {
    return '$\u00a0' + amount.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}
