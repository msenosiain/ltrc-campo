import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Match, SquadEntry } from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../../common/category-options';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export interface ShareSquadDialogData {
  match: Match;
  starters: SquadEntry[];
  subs: SquadEntry[];
}

@Component({
  selector: 'ltrc-share-squad-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
  ],
  templateUrl: './share-squad-dialog.component.html',
  styleUrl: './share-squad-dialog.component.scss',
})
export class ShareSquadDialogComponent {
  readonly dialogRef = inject(MatDialogRef<ShareSquadDialogComponent>);
  readonly data: ShareSquadDialogData = inject(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.group({
    convocationDate: [this.matchDate(), Validators.required],
    convocationTime: [this.oneHourBefore(), Validators.required],
  });

  private matchDate(): Date | null {
    const d = this.data.match.date;
    if (!d) return null;
    return new Date((d as unknown as string).substring(0, 10) + 'T12:00:00Z');
  }

  private oneHourBefore(): string {
    const time = this.data.match.time;
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const totalMin = (h * 60 + m - 60 + 24 * 60) % (24 * 60);
    return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
  }

  share(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const url = `https://wa.me/?text=${encodeURIComponent(this.buildMessage())}`;
    window.open(url, '_blank');
    this.dialogRef.close();
  }

  private buildMessage(): string {
    const { match, starters, subs } = this.data;
    const { convocationDate, convocationTime } = this.form.value;

    const category = getCategoryLabel(match.category);
    const division = match.division ? ` ${match.division}` : '';
    const rival = match.opponent ?? 'a confirmar';
    const venue = match.venue ?? 'a confirmar';
    const dateStr = format(convocationDate!, "EEEE d/MM", { locale: es });
    const dateCapitalized = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

    const lines: string[] = [
      `*Convocatoria ${category}${division}*`,
      ``,
      `Fecha: ${dateCapitalized} ${convocationTime}hs`,
      `Cancha: ${venue}`,
      `vs ${rival}`,
      ``,
    ];

    if (starters.length) {
      lines.push(`*Titulares*`);
      starters.forEach((e) => {
        const p = e.player as any;
        lines.push(`${e.shirtNumber}. ${p?.name ?? '—'}`);
      });
      lines.push('');
    }

    if (subs.length) {
      lines.push(`*Suplentes*`);
      subs.forEach((e) => {
        const p = e.player as any;
        lines.push(`${e.shirtNumber}. ${p?.name ?? '—'}`);
      });
    }

    return lines.join('\n');
  }
}
