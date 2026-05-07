import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { map, Observable, startWith } from 'rxjs';
import { PaymentsService } from '../../services/payments.service';
import { PaymentEntityTypeEnum, PaymentTypeEnum } from '@ltrc-campo/shared-api-model';
import { format } from 'date-fns';

interface DialogData {
  entityType: PaymentEntityTypeEnum;
  entityId: string;
  entityDate?: Date;
  entityLabel?: string;
}

@Component({
  selector: 'ltrc-create-payment-link-dialog',
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
    MatDividerModule,
    MatAutocompleteModule,
    MatCheckboxModule,
  ],
  templateUrl: './create-payment-link-dialog.component.html',
  styleUrl: './create-payment-link-dialog.component.scss',
})
export class CreatePaymentLinkDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<CreatePaymentLinkDialogComponent>);
  private readonly data = inject<DialogData>(MAT_DIALOG_DATA);
  private readonly paymentsService = inject(PaymentsService);

  saving = false;
  mpFeeRate = 0.048279;
  allConcepts: string[] = [];
  filteredConcepts$!: Observable<string[]>;

  readonly paymentTypes = [
    { value: PaymentTypeEnum.FULL, label: 'Pago total' },
    { value: PaymentTypeEnum.PARTIAL, label: 'Pago parcial' },
    { value: PaymentTypeEnum.INSTALLMENT, label: 'Cuota' },
  ];

  readonly PaymentTypeEnum = PaymentTypeEnum;

  form = new FormGroup({
    concept: new FormControl('Tercer tiempo', [Validators.required]),
    description: new FormControl(''),
    addMpFee: new FormControl(false),
    amount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    paymentType: new FormControl(PaymentTypeEnum.FULL, [Validators.required]),
    installmentNumber: new FormControl<number | null>(null),
    installmentTotal: new FormControl<number | null>(null),
    expiresAt: new FormControl<Date | null>(null, [Validators.required]),
    expiresAtTime: new FormControl('23:59', [Validators.required]),
  });

  ngOnInit() {
    const patch: Record<string, unknown> = {};
    if (this.data.entityDate) {
      patch['expiresAt'] = new Date(this.data.entityDate);
    }
    if (this.data.entityLabel) {
      patch['description'] = this.data.entityLabel;
    }
    if (Object.keys(patch).length) {
      this.form.patchValue(patch);
    }
    // Carga el fee rate configurado en el servidor una sola vez
    this.paymentsService.getConfig().subscribe({
      next: ({ mpFeeRate }) => (this.mpFeeRate = mpFeeRate),
    });
    // Carga conceptos previos para el autocomplete
    this.paymentsService.getFieldOptions().subscribe({
      next: ({ concepts }) => (this.allConcepts = concepts),
    });
    const conceptCtrl = this.form.get('concept')!;
    this.filteredConcepts$ = conceptCtrl.valueChanges.pipe(
      startWith(conceptCtrl.value ?? ''),
      map((v) => {
        const filter = (v ?? '').toLowerCase();
        return this.allConcepts.filter((c) => c.toLowerCase().includes(filter));
      })
    );
  }

  get addMpFee(): boolean {
    return this.form.get('addMpFee')!.value ?? false;
  }

  get netTarget(): number {
    return this.form.get('amount')!.value ?? 0;
  }

  get rawGrossAmount(): number {
    return this.netTarget / (1 - this.mpFeeRate);
  }

  get grossAmount(): number {
    return Math.ceil(this.rawGrossAmount / 10) * 10;
  }

  get roundingAmount(): number {
    return Math.round((this.grossAmount - this.rawGrossAmount) * 100) / 100;
  }

  get mpFeeAmount(): number {
    return Math.round(this.grossAmount * this.mpFeeRate * 100) / 100;
  }

  get netAmount(): number {
    return Math.round((this.grossAmount - this.mpFeeAmount) * 100) / 100;
  }

  get showFeePreview(): boolean {
    return this.addMpFee && this.netTarget > 0;
  }

  get isInstallment(): boolean {
    return this.form.get('paymentType')!.value === PaymentTypeEnum.INSTALLMENT;
  }

  submit() {
    if (this.form.invalid) return;
    this.saving = true;
    const value = this.form.value;

    this.paymentsService
      .createLink({
        entityType: this.data.entityType,
        entityId: this.data.entityId,
        concept: value.concept!,
        description: value.description || undefined,
        addMpFee: value.addMpFee ?? false,
        amount: value.amount!,
        paymentType: value.paymentType!,
        installmentNumber: this.isInstallment ? value.installmentNumber ?? undefined : undefined,
        installmentTotal: this.isInstallment ? value.installmentTotal ?? undefined : undefined,
        expiresAt: this.toLocalIso(value.expiresAt!, value.expiresAtTime || '23:59'),
      })
      .subscribe({
        next: (link) => this.dialogRef.close(link),
        error: () => (this.saving = false),
      });
  }

  private toLocalIso(date: Date, time: string): string {
    const dateStr = format(date, 'yyyy-MM-dd');
    const offsetMin = new Date().getTimezoneOffset();
    const sign = offsetMin <= 0 ? '+' : '-';
    const absMin = Math.abs(offsetMin);
    const hh = String(Math.floor(absMin / 60)).padStart(2, '0');
    const mm = String(absMin % 60).padStart(2, '0');
    return `${dateStr}T${time}:00${sign}${hh}:${mm}`;
  }
}
