import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PaymentsService } from '../../services/payments.service';
import { PaymentEntityTypeEnum, PaymentMethodEnum } from '@ltrc-campo/shared-api-model';
import { format } from 'date-fns';

interface DialogData {
  entityType: PaymentEntityTypeEnum;
  entityId: string;
}

@Component({
  selector: 'ltrc-record-manual-payment-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './record-manual-payment-dialog.component.html',
  styleUrl: './record-manual-payment-dialog.component.scss',
})
export class RecordManualPaymentDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<RecordManualPaymentDialogComponent>);
  private readonly data = inject<DialogData>(MAT_DIALOG_DATA);
  private readonly paymentsService = inject(PaymentsService);

  saving = false;
  playerNotFound = false;

  readonly methods = [
    { value: PaymentMethodEnum.CASH, label: 'Efectivo' },
    { value: PaymentMethodEnum.TRANSFER, label: 'Transferencia' },
  ];

  form = new FormGroup({
    playerDni: new FormControl('', [Validators.required, Validators.minLength(6)]),
    playerId: new FormControl(''),
    playerName: new FormControl(''),
    concept: new FormControl(
      this.data.entityType === PaymentEntityTypeEnum.TRIP ? '' : 'Tercer tiempo',
      [Validators.required]
    ),
    amount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    method: new FormControl(PaymentMethodEnum.CASH, [Validators.required]),
    date: new FormControl<Date | null>(new Date(), [Validators.required]),
    notes: new FormControl(''),
  });

  searchPlayer() {
    const dni = this.form.get('playerDni')!.value;
    if (!dni) return;
    this.playerNotFound = false;

    this.paymentsService.findPlayerByDni(dni).subscribe({
      next: (result) => {
        this.form.patchValue({ playerId: result.playerId, playerName: result.playerName });
      },
      error: () => {
        this.playerNotFound = true;
        this.form.patchValue({ playerId: '', playerName: '' });
      },
    });
  }

  submit() {
    if (this.form.invalid || !this.form.get('playerId')!.value) return;
    this.saving = true;
    const value = this.form.value;

    this.paymentsService
      .recordManual({
        entityType: this.data.entityType,
        entityId: this.data.entityId,
        playerId: value.playerId!,
        amount: value.amount!,
        method: value.method!,
        concept: value.concept!,
        date: format(value.date!, 'yyyy-MM-dd'),
        notes: value.notes || undefined,
      })
      .subscribe({
        next: (payment) => this.dialogRef.close(payment),
        error: () => (this.saving = false),
      });
  }
}
