import {
  Component,
  Input,
  OnInit,
  OnChanges,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { MatchPoll, PollResults } from '@ltrc-campo/shared-api-model';
import { PollsAdminService } from '../../services/polls.service';
import * as QRCode from 'qrcode';

@Component({
  selector: 'ltrc-poll-panel',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatTooltipModule,
    DatePipe,
  ],
  templateUrl: './poll-panel.component.html',
  styleUrl: './poll-panel.component.scss',
})
export class PollPanelComponent implements OnInit, OnChanges {
  @Input({ required: true }) matchId!: string;

  private readonly fb = inject(FormBuilder);
  private readonly pollsService = inject(PollsAdminService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  poll = signal<MatchPoll | null>(null);
  results = signal<PollResults | null>(null);
  loading = signal(false);
  saving = signal(false);
  deleting = signal(false);
  qrDataUrl = signal<string | null>(null);
  editing = signal(false);

  private refreshSub?: Subscription;

  readonly podiumEmoji = ['🥇', '🥈', '🥉'];

  form = this.fb.group({
    startsAt: [null as Date | null, Validators.required],
    endsAt: [null as Date | null, Validators.required],
    startsAtTime: ['00:00', Validators.required],
    endsAtTime: ['23:59', Validators.required],
  });

  ngOnInit(): void {
    this.loadPoll();
  }

  ngOnChanges(): void {
    this.loadPoll();
  }

  private get pollKey(): string {
    const p = this.poll();
    return p?.slug ?? p?.token ?? '';
  }

  get votingUrl(): string {
    const path = this.poll()?.votingPath ?? this.pollKey;
    return `https://tv.lostordos.com.ar/votar/${path}`;
  }

  private loadPoll(): void {
    if (!this.matchId) return;
    this.loading.set(true);
    this.pollsService
      .get(this.matchId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (poll) => {
          this.poll.set(poll);
          this.loading.set(false);
          if (poll) {
            this.generateQr();
            this.loadResults();
            this.startAutoRefresh();
          }
        },
        error: () => this.loading.set(false),
      });
  }

  loadResults(): void {
    const key = this.pollKey;
    if (!key) return;
    this.pollsService.getResults(key)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (r) => this.results.set(r), error: () => { /* ignore */ } });
  }

  private startAutoRefresh(): void {
    this.refreshSub?.unsubscribe();
    if (!this.poll()?.isActive) return;
    this.refreshSub = interval(15000)
      .pipe(
        switchMap(() => this.pollsService.getResults(this.pollKey)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({ next: (r) => this.results.set(r), error: () => { /* ignore */ } });
  }

  copyResults(): void {
    const r = this.results();
    if (!r) return;
    const lines = r.top3.map((p, i) => `${this.podiumEmoji[i]} #${p.shirtNumber} ${p.playerName} — ${p.percentage}%`);
    const text = [`Jugador del partido (${r.totalVotes} votos)`, ...lines].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this.snackBar.open('Resultados copiados', 'Cerrar', { duration: 2000 });
    });
  }

  private generateQr(): void {
    QRCode.toDataURL(this.votingUrl, { width: 200, margin: 1, color: { dark: '#1a1a2e', light: '#ffffff' } })
      .then((url) => this.qrDataUrl.set(url))
      .catch(() => { /* ignore */ });
  }

  startCreate(): void {
    this.editing.set(true);
    this.form.reset({ startsAtTime: '00:00', endsAtTime: '23:59' });
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  private buildDatetime(date: Date | null, time: string | null): Date {
    const d = new Date(date!);
    const [h, m] = (time ?? '00:00').split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }

  save(): void {
    if (this.form.invalid) return;
    const { startsAt, endsAt, startsAtTime, endsAtTime } = this.form.value;
    const start = this.buildDatetime(startsAt!, startsAtTime!);
    const end = this.buildDatetime(endsAt!, endsAtTime!);

    this.saving.set(true);
    const op = this.poll()
      ? this.pollsService.update(this.matchId, start, end)
      : this.pollsService.create(this.matchId, start, end);

    op.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (poll) => {
        this.poll.set(poll);
        this.saving.set(false);
        this.editing.set(false);
        this.generateQr();
        this.loadResults();
        this.startAutoRefresh();
        this.snackBar.open('Votación guardada', 'Cerrar', { duration: 3000 });
      },
      error: (err) => {
        this.saving.set(false);
        this.snackBar.open(err?.error?.message ?? 'Error al guardar la votación', 'Cerrar', { duration: 4000 });
      },
    });
  }

  editPoll(): void {
    const poll = this.poll();
    if (!poll) return;
    const start = new Date(poll.startsAt);
    const end = new Date(poll.endsAt);
    this.form.setValue({
      startsAt: start,
      endsAt: end,
      startsAtTime: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      endsAtTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
    });
    this.editing.set(true);
  }

  deletePoll(): void {
    if (!confirm('¿Eliminar la votación? Esta acción no se puede deshacer.')) return;
    this.deleting.set(true);
    this.pollsService
      .delete(this.matchId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.poll.set(null);
          this.results.set(null);
          this.qrDataUrl.set(null);
          this.refreshSub?.unsubscribe();
          this.deleting.set(false);
          this.snackBar.open('Votación eliminada', 'Cerrar', { duration: 3000 });
        },
        error: () => {
          this.deleting.set(false);
          this.snackBar.open('Error al eliminar la votación', 'Cerrar', { duration: 4000 });
        },
      });
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.snackBar.open('Link copiado', 'Cerrar', { duration: 2000 });
    });
  }
}
