import { Component, OnInit, inject, DestroyRef, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { EvaluationsService } from '../../services/evaluations.service';
import { getCategoryLabel, getCategoryOptionsBySport } from '../../../common/category-options';

interface CategorySettingsRow {
  category: CategoryEnum;
  sport: SportEnum;
  label: string;
  enabled: boolean;
  saving: boolean;
}

@Component({
  selector: 'ltrc-evaluation-settings',
  standalone: true,
  imports: [
    MatCardModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './evaluation-settings.component.html',
  styleUrl: './evaluation-settings.component.scss',
})
export class EvaluationSettingsComponent implements OnInit {
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  loading = signal(false);
  rows: CategorySettingsRow[] = [];

  ngOnInit(): void {
    this.loading.set(true);
    this.evaluationsService
      .getAllSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.rows = this.buildRows(settings);
          this.loading.set(false);
        },
        error: () => {
          this.rows = this.buildRows([]);
          this.loading.set(false);
        },
      });
  }

  toggle(row: CategorySettingsRow, enabled: boolean): void {
    row.saving = true;
    this.evaluationsService
      .toggleSettings(row.category, row.sport, enabled)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          row.enabled = updated.evaluationsEnabled;
          row.saving = false;
          this.snackBar.open(
            `Evaluaciones ${enabled ? 'activadas' : 'desactivadas'} para ${row.label}`,
            'Cerrar',
            { duration: 3000 }
          );
        },
        error: () => {
          row.enabled = !enabled; // revert
          row.saving = false;
          this.snackBar.open('Error al guardar', 'Cerrar', { duration: 4000 });
        },
      });
  }

  private buildRows(
    settings: { category: CategoryEnum; sport: SportEnum; evaluationsEnabled: boolean }[]
  ): CategorySettingsRow[] {
    const settingsMap = new Map(
      settings.map((s) => [`${s.category}|${s.sport}`, s.evaluationsEnabled])
    );

    const rugbyCategories = getCategoryOptionsBySport(SportEnum.RUGBY);
    const hockeyCategories = getCategoryOptionsBySport(SportEnum.HOCKEY);

    const rows: CategorySettingsRow[] = [];

    for (const cat of rugbyCategories) {
      rows.push({
        category: cat.id,
        sport: SportEnum.RUGBY,
        label: `Rugby — ${cat.label}`,
        enabled: settingsMap.get(`${cat.id}|${SportEnum.RUGBY}`) ?? false,
        saving: false,
      });
    }

    for (const cat of hockeyCategories) {
      rows.push({
        category: cat.id,
        sport: SportEnum.HOCKEY,
        label: `Hockey — ${cat.label}`,
        enabled: settingsMap.get(`${cat.id}|${SportEnum.HOCKEY}`) ?? false,
        saving: false,
      });
    }

    return rows;
  }
}
