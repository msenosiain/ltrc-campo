import { Component, computed, DestroyRef, inject, Input, OnChanges, signal, SimpleChanges } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CategoryEnum, IPlayerFeeStatusRow, SportEnum } from '@ltrc-campo/shared-api-model';
import { PlayerFeesAdminService } from '../../services/player-fees-admin.service';

@Component({
  selector: 'ltrc-player-eligibility-editor',
  standalone: true,
  imports: [
    MatCheckboxModule,
    MatSelectModule,
    MatFormFieldModule,
    MatProgressBarModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './player-eligibility-editor.component.html',
  styleUrl: './player-eligibility-editor.component.scss',
})
export class PlayerEligibilityEditorComponent implements OnChanges {
  private readonly adminService = inject(PlayerFeesAdminService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snackBar = inject(MatSnackBar);

  @Input({ required: true }) playerId!: string;
  @Input() sport: SportEnum = SportEnum.RUGBY;

  readonly seasonOptions = (() => {
    const y = new Date().getFullYear();
    return [String(y + 1), String(y), String(y - 1)];
  })();

  season = signal(String(new Date().getFullYear()));
  status = signal<IPlayerFeeStatusRow | null>(null);
  loading = signal(false);
  saving = signal(false);

  readonly hasCursos = computed(() => this.status()?.cursosAprobados !== undefined);
  readonly hasFondo = computed(() => this.status()?.fondoSolidarioPagado !== undefined);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['playerId'] && this.playerId) {
      this.load();
    }
  }

  load(): void {
    this.loading.set(true);
    this.adminService.getPlayerStatus(this.playerId, this.season())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => { this.status.set(rows[0] ?? null); this.loading.set(false); },
        error: () => this.loading.set(false),
      });
  }

  onSeasonChange(season: string): void {
    this.season.set(season);
    this.load();
  }

  toggle(field: 'fichaMedica' | 'fichajeBDUAR' | 'cursosAprobados' | 'fondoSolidarioPagado', value: boolean): void {
    this.status.update(s => s ? { ...s, [field]: value } : s);
    this.saving.set(true);

    this.adminService.updateSeasonRecord(this.playerId, { season: this.season(), sport: this.sport, [field]: value })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.saving.set(false),
        error: () => {
          this.status.update(s => s ? { ...s, [field]: !value } : s);
          this.saving.set(false);
          this.snackBar.open('Error saving', 'Close', { duration: 3000 });
        },
      });
  }
}
