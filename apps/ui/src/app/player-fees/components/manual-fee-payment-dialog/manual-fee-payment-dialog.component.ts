import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { IPlayerFeeStatusRow, PaymentMethodEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { PlayerFeesAdminService } from '../../services/player-fees-admin.service';
import { DecimalPipe } from '@angular/common';

export interface ManualFeePaymentDialogData {
  rows: IPlayerFeeStatusRow[];
  season: string;
  sport: SportEnum;
}

interface AmountPreview {
  originalAmount: number | null;
  discountPct: number | null;
  discountReason: string | null;
  finalAmount: number | null;
}

@Component({
  selector: 'ltrc-manual-fee-payment-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    DecimalPipe,
  ],
  templateUrl: './manual-fee-payment-dialog.component.html',
  styleUrl: './manual-fee-payment-dialog.component.scss',
})
export class ManualFeePaymentDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ManualFeePaymentDialogComponent>);
  readonly data = inject<ManualFeePaymentDialogData>(MAT_DIALOG_DATA);
  private readonly adminService = inject(PlayerFeesAdminService);

  saving = false;

  readonly pendingRows = this.data.rows.filter(r => !r.feePaid);

  readonly methods = [
    { value: PaymentMethodEnum.CASH, label: 'Efectivo' },
    { value: PaymentMethodEnum.TRANSFER, label: 'Transferencia' },
  ];

  readonly playerSearch = new FormControl('');
  readonly searchTerm = signal('');
  readonly amountPreview = signal<AmountPreview | null>(null);
  readonly loadingPreview = signal(false);

  readonly filteredRows = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return [];
    return this.pendingRows.filter(r =>
      r.playerName?.toLowerCase().includes(term) ||
      r.playerDni?.includes(term)
    );
  });

  form = new FormGroup({
    playerId: new FormControl('', [Validators.required]),
    method: new FormControl<PaymentMethodEnum>(PaymentMethodEnum.CASH, [Validators.required]),
  });

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
    if (this.form.get('playerId')?.value) {
      this.form.get('playerId')!.setValue('');
      this.amountPreview.set(null);
    }
  }

  selectPlayer(row: IPlayerFeeStatusRow): void {
    this.playerSearch.setValue(row.playerName, { emitEvent: false });
    this.form.get('playerId')!.setValue(row.playerId);
    this.searchTerm.set('');
    this.amountPreview.set(null);
    this.loadingPreview.set(true);

    this.adminService.previewManualPayment(row.playerId, this.data.season, this.data.sport)
      .subscribe({
        next: (preview) => {
          this.amountPreview.set(preview);
          this.loadingPreview.set(false);
        },
        error: () => this.loadingPreview.set(false),
      });
  }

  submit(): void {
    if (this.form.invalid) return;
    this.saving = true;
    const { playerId, method } = this.form.value;

    this.adminService.recordManualPayment({
      playerId: playerId!,
      season: this.data.season,
      sport: this.data.sport,
      method: method!,
    }).subscribe({
      next: () => this.dialogRef.close(true),
      error: () => { this.saving = false; },
    });
  }
}
