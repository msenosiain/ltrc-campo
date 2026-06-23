import { Component, inject, OnInit } from '@angular/core';
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
import { PaymentsService, TripParticipantForPayment } from '../../services/payments.service';
import { PaymentEntityTypeEnum, PaymentMethodEnum, TripParticipantTypeEnum } from '@ltrc-campo/shared-api-model';
import { format } from 'date-fns';
import { debounceTime, distinctUntilChanged, Observable, of, Subject, switchMap } from 'rxjs';

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
export class RecordManualPaymentDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<RecordManualPaymentDialogComponent>);
  private readonly data = inject<DialogData>(MAT_DIALOG_DATA);
  private readonly paymentsService = inject(PaymentsService);

  saving = false;
  saveError: string | null = null;

  readonly isTrip = this.data.entityType === PaymentEntityTypeEnum.TRIP;

  readonly methods = [
    { value: PaymentMethodEnum.CASH, label: 'Efectivo' },
    { value: PaymentMethodEnum.TRANSFER, label: 'Transferencia' },
  ];

  // Trip: lista de pasajeros con saldo pendiente
  tripParticipants: TripParticipantForPayment[] = [];
  filteredParticipants: TripParticipantForPayment[] = [];

  // No-trip: búsqueda libre de jugadores
  private readonly search$ = new Subject<string>();
  readonly playerSearchResults$: Observable<{ playerId: string; playerName: string; idNumber: string }[]> =
    this.search$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((q) => q.trim().length >= 2 ? this.paymentsService.searchPlayers(q) : of([]))
    );

  readonly searchInput = new FormControl('');

  form = new FormGroup({
    // identificadores — solo uno se usa según el tipo de participante
    playerId:        new FormControl(''),
    userId:          new FormControl(''),
    extPayerName:    new FormControl(''),
    extPayerDni:     new FormControl(''),
    displayName:     new FormControl(''), // solo para mostrar en pantalla
    concept: new FormControl(this.isTrip ? '' : 'Tercer tiempo', [Validators.required]),
    amount:  new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    method:  new FormControl(PaymentMethodEnum.TRANSFER, [Validators.required]),
    date:    new FormControl<Date | null>(new Date(), [Validators.required]),
    notes:   new FormControl(''),
  });

  ngOnInit() {
    if (this.isTrip) {
      this.paymentsService.getTripParticipantsForPayment(this.data.entityId).subscribe({
        next: (list) => {
          this.tripParticipants = list;
          this.filteredParticipants = list;
        },
      });
    }
  }

  // ── Trip: filtrar lista de pasajeros ───────────────────────────────────────

  onTripSearchInput(value: string) {
    this.clearSelection();
    const q = value.toLowerCase().trim();
    this.filteredParticipants = q
      ? this.tripParticipants.filter(
          (p) => p.payerName.toLowerCase().includes(q) || (p.payerDni ?? '').startsWith(q)
        )
      : this.tripParticipants;
  }

  selectParticipant(p: TripParticipantForPayment) {
    this.searchInput.setValue(p.payerName, { emitEvent: false });
    this.form.patchValue({
      playerId:     p.playerId  ?? '',
      userId:       p.userId    ?? '',
      extPayerName: (!p.playerId && !p.userId) ? p.payerName : '',
      extPayerDni:  (!p.playerId && !p.userId) ? (p.payerDni ?? '') : '',
      displayName:  p.payerName,
    });
    this.saveError = null;
  }

  participantTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      [TripParticipantTypeEnum.PLAYER]:   'Jugador',
      [TripParticipantTypeEnum.STAFF]:    'Staff',
      [TripParticipantTypeEnum.EXTERNAL]: 'Externo',
    };
    return labels[type] ?? type;
  }

  // ── No-trip: búsqueda libre ────────────────────────────────────────────────

  onPlayerSearchInput(value: string) {
    this.clearSelection();
    this.search$.next(value);
  }

  selectPlayer(p: { playerId: string; playerName: string; idNumber: string }) {
    this.searchInput.setValue(`${p.playerName} (${p.idNumber})`, { emitEvent: false });
    this.form.patchValue({ playerId: p.playerId, displayName: p.playerName });
    this.saveError = null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private clearSelection() {
    this.form.patchValue({ playerId: '', userId: '', extPayerName: '', extPayerDni: '', displayName: '' });
  }

  get isParticipantSelected(): boolean {
    const v = this.form.value;
    return !!(v.playerId || v.userId || v.extPayerName);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  submit() {
    if (this.form.invalid || !this.isParticipantSelected) return;
    this.saving = true;
    this.saveError = null;
    const v = this.form.value;

    this.paymentsService
      .recordManual({
        entityType: this.data.entityType,
        entityId:   this.data.entityId,
        playerId:   v.playerId  || undefined,
        userId:     v.userId    || undefined,
        payerName:  v.extPayerName || undefined,
        payerDni:   v.extPayerDni  || undefined,
        amount:     v.amount!,
        method:     v.method!,
        concept:    v.concept!,
        date:       format(v.date!, 'yyyy-MM-dd'),
        notes:      v.notes || undefined,
      })
      .subscribe({
        next:  (payment) => this.dialogRef.close(payment),
        error: (err) => {
          this.saving = false;
          this.saveError = err?.error?.message ?? 'Error al registrar el pago';
        },
      });
  }
}
