import { Component, inject } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { format } from 'date-fns';
import { PaymentMethodEnum, Trip, TripParticipant, TripParticipantTypeEnum } from '@ltrc-campo/shared-api-model';
import { TripsService } from '../../services/trips.service';

interface DialogData {
  trip: Trip;
}

@Component({
  selector: 'ltrc-trip-record-payment-dialog',
  standalone: true,
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  templateUrl: './trip-record-payment-dialog.component.html',
  styleUrl: './trip-record-payment-dialog.component.scss',
})
export class TripRecordPaymentDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<TripRecordPaymentDialogComponent>);
  readonly data = inject<DialogData>(MAT_DIALOG_DATA);
  private readonly tripsService = inject(TripsService);
  private readonly destroyRef = inject(DestroyRef);

  saving = false;
  notFound = false;
  foundParticipant: TripParticipant | null = null;

  readonly methods = [
    { value: PaymentMethodEnum.CASH, label: 'Efectivo' },
    { value: PaymentMethodEnum.TRANSFER, label: 'Transferencia' },
  ];

  form = new FormGroup({
    dni: new FormControl('', [Validators.required, Validators.minLength(6)]),
    amount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    method: new FormControl<PaymentMethodEnum>(PaymentMethodEnum.CASH, [Validators.required]),
    date: new FormControl<Date | null>(new Date(), [Validators.required]),
    notes: new FormControl(''),
  });

  get participantName(): string {
    const p = this.foundParticipant;
    if (!p) return '';
    if (p.type === TripParticipantTypeEnum.PLAYER) return (p.player as any)?.name ?? '';
    if (p.type === TripParticipantTypeEnum.STAFF) return (p as any).user?.name ?? p.userName ?? '';
    return p.externalName ?? '';
  }

  get pendingBalance(): number {
    const p = this.foundParticipant;
    if (!p) return 0;
    const paid = p.payments?.reduce((sum, pay) => sum + pay.amount, 0) ?? 0;
    return p.costAssigned - paid;
  }

  searchByDni(): void {
    const dni = this.form.get('dni')!.value?.trim();
    if (!dni) return;
    this.notFound = false;
    this.foundParticipant = null;

    const found = this.data.trip.participants.find((p) => {
      if (p.type === TripParticipantTypeEnum.PLAYER) return (p.player as any)?.idNumber === dni;
      if (p.type === TripParticipantTypeEnum.STAFF) return (p as any).user?.idNumber === dni;
      if (p.type === TripParticipantTypeEnum.EXTERNAL) return p.externalDni === dni;
      return false;
    });

    if (found) {
      this.foundParticipant = found;
      this.form.patchValue({ amount: this.pendingBalance > 0 ? this.pendingBalance : null });
    } else {
      this.notFound = true;
    }
  }

  submit(): void {
    if (this.form.invalid || !this.foundParticipant?.id) return;
    this.saving = true;
    const v = this.form.value;

    this.tripsService
      .recordPayment(this.data.trip.id!, this.foundParticipant.id, {
        amount: v.amount!,
        method: v.method ?? undefined,
        date: format(v.date!, 'yyyy-MM-dd'),
        notes: v.notes || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (trip) => this.dialogRef.close(trip),
        error: () => (this.saving = false),
      });
  }
}
