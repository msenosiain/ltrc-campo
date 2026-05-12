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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { PaymentsService } from '../../services/payments.service';
import { PaymentEntityTypeEnum, PaymentMethodEnum } from '@ltrc-campo/shared-api-model';
import { format } from 'date-fns';
import { debounceTime, distinctUntilChanged, Subject, switchMap, of } from 'rxjs';

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
    MatAutocompleteModule,
  ],
  templateUrl: './record-manual-payment-dialog.component.html',
  styleUrl: './record-manual-payment-dialog.component.scss',
})
export class RecordManualPaymentDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<RecordManualPaymentDialogComponent>);
  private readonly data = inject<DialogData>(MAT_DIALOG_DATA);
  private readonly paymentsService = inject(PaymentsService);

  saving = false;
  saveError: string | null = null;

  readonly methods = [
    { value: PaymentMethodEnum.CASH, label: 'Efectivo' },
    { value: PaymentMethodEnum.TRANSFER, label: 'Transferencia' },
  ];

  readonly searchInput = new FormControl('');
  searchResults: { playerId: string; playerName: string; idNumber: string }[] = [];

  private readonly search$ = new Subject<string>();
  readonly searchResults$ = this.search$.pipe(
    debounceTime(250),
    distinctUntilChanged(),
    switchMap((q) => q.trim().length >= 2 ? this.paymentsService.searchPlayers(q) : of([]))
  );

  form = new FormGroup({
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

  onSearchInput(value: string) {
    this.form.patchValue({ playerId: '', playerName: '' });
    this.search$.next(value);
  }

  selectPlayer(player: { playerId: string; playerName: string; idNumber: string }) {
    this.searchInput.setValue(`${player.playerName} (${player.idNumber})`, { emitEvent: false });
    this.form.patchValue({ playerId: player.playerId, playerName: player.playerName });
    this.saveError = null;
  }

  displayFn(value: string): string {
    return value;
  }

  submit() {
    if (this.form.invalid || !this.form.get('playerId')!.value) return;
    this.saving = true;
    this.saveError = null;
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
        error: (err) => {
          this.saving = false;
          this.saveError = err?.error?.message ?? 'Error al registrar el pago';
        },
      });
  }
}
