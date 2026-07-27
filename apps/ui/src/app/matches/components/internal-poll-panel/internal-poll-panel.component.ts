import {
  Component,
  DestroyRef,
  Input,
  OnChanges,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, interval, Subscription, switchMap } from 'rxjs';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import * as QRCode from 'qrcode';
import {
  InternalPoll,
  InternalPollResults,
  InternalPollVoter,
  SquadEntry,
} from '@ltrc-campo/shared-api-model';
import { InternalPollsAdminService } from '../../services/internal-polls.service';

interface StaffUser {
  id: string;
  name: string;
  roles: string[];
}

@Component({
  selector: 'ltrc-internal-poll-panel',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatTooltipModule,
    MatChipsModule,
    MatAutocompleteModule,
  ],
  templateUrl: './internal-poll-panel.component.html',
  styleUrl: './internal-poll-panel.component.scss',
})
export class InternalPollPanelComponent implements OnInit, OnChanges {
  @Input({ required: true }) matchId!: string;
  @Input() squad: SquadEntry[] = [];

  private readonly fb = inject(FormBuilder);
  private readonly service = inject(InternalPollsAdminService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  poll = signal<InternalPoll | null>(null);
  results = signal<InternalPollResults | null>(null);
  loading = signal(false);
  saving = signal(false);
  deleting = signal(false);
  editing = signal(false);
  qrDataUrl = signal<string | null>(null);

  awards = signal<string[]>([]);
  newAwardName = '';

  staffSearch = signal<StaffUser[]>([]);
  selectedStaff = signal<StaffUser[]>([]);

  private refreshSub?: Subscription;

  readonly podiumEmoji = ['🥇', '🥈', '🥉'];

  form = this.fb.group({
    startsAt: [null as Date | null, Validators.required],
    endsAt: [null as Date | null, Validators.required],
    startsAtTime: ['00:00', Validators.required],
    endsAtTime: ['23:59', Validators.required],
    staffSearchInput: [''],
  });

  get hasSquad(): boolean {
    return this.squad?.length > 0;
  }

  get votingUrl(): string {
    return this.poll()?.votingUrl ?? `https://campo.lostordos.com.ar/votar-interno/${this.matchId}`;
  }

  ngOnInit(): void {
    this.loadPoll();
    this.setupStaffSearch();
  }

  ngOnChanges(): void {
    this.loadPoll();
  }

  private setupStaffSearch(): void {
    this.form.get('staffSearchInput')!.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => this.service.searchStaff(this.matchId, q ?? '')),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((users) => this.staffSearch.set(users));
  }

  private loadPoll(): void {
    if (!this.matchId) return;
    this.loading.set(true);
    this.service.get(this.matchId)
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
    if (!this.matchId) return;
    this.service.getResults(this.matchId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (r) => this.results.set(r), error: () => {} });
  }

  private startAutoRefresh(): void {
    this.refreshSub?.unsubscribe();
    if (!this.poll()?.isActive) return;
    this.refreshSub = interval(15000)
      .pipe(
        switchMap(() => this.service.getResults(this.matchId)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({ next: (r) => this.results.set(r), error: () => {} });
  }

  private generateQr(): void {
    QRCode.toDataURL(this.votingUrl, { width: 200, margin: 1, color: { dark: '#1a1a2e', light: '#ffffff' } })
      .then((url) => this.qrDataUrl.set(url))
      .catch(() => {});
  }

  startCreate(): void {
    this.awards.set([]);
    this.selectedStaff.set([]);
    this.editing.set(true);
    this.form.reset({ startsAtTime: '00:00', endsAtTime: '23:59', staffSearchInput: '' });
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  addAward(): void {
    const name = this.newAwardName.trim();
    if (!name || this.awards().includes(name)) return;
    this.awards.update((list) => [...list, name]);
    this.newAwardName = '';
  }

  removeAward(name: string): void {
    this.awards.update((list) => list.filter((a) => a !== name));
  }

  selectStaff(user: StaffUser): void {
    if (this.selectedStaff().some((u) => u.id === user.id)) return;
    this.selectedStaff.update((list) => [...list, user]);
    this.form.get('staffSearchInput')!.setValue('', { emitEvent: false });
    this.staffSearch.set([]);
  }

  removeStaff(userId: string): void {
    this.selectedStaff.update((list) => list.filter((u) => u.id !== userId));
  }

  private buildDatetime(date: Date | null, time: string | null): Date {
    const d = new Date(date!);
    const [h, m] = (time ?? '00:00').split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }

  save(): void {
    if (this.form.invalid || this.awards().length === 0) {
      if (this.awards().length === 0) {
        this.snackBar.open('Agregá al menos un tipo de premio', 'Cerrar', { duration: 3000 });
      }
      return;
    }
    const { startsAt, endsAt, startsAtTime, endsAtTime } = this.form.value;
    const start = this.buildDatetime(startsAt!, startsAtTime!);
    const end = this.buildDatetime(endsAt!, endsAtTime!);
    const awardDtos = this.awards().map((name) => ({ name }));
    const staffIds = this.selectedStaff().map((u) => u.id);

    this.saving.set(true);
    const op = this.poll()
      ? this.service.update(this.matchId, awardDtos, start, end, staffIds)
      : this.service.create(this.matchId, awardDtos, start, end, staffIds);

    op.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (poll) => {
        this.poll.set(poll);
        this.saving.set(false);
        this.editing.set(false);
        this.generateQr();
        this.loadResults();
        this.startAutoRefresh();
        this.snackBar.open('Votación interna guardada', 'Cerrar', { duration: 3000 });
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
    this.awards.set(poll.awards.map((a) => a.name));
    this.selectedStaff.set(
      poll.voters
        .filter((v: InternalPollVoter) => v.weight === 2)
        .map((v: InternalPollVoter) => ({ id: v.userId, name: v.name, roles: [] }))
    );
    this.form.setValue({
      startsAt: start,
      endsAt: end,
      startsAtTime: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      endsAtTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
      staffSearchInput: '',
    });
    this.editing.set(true);
  }

  deletePoll(): void {
    if (!confirm('¿Eliminar la votación interna? Esta acción no se puede deshacer.')) return;
    this.deleting.set(true);
    this.service.delete(this.matchId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.poll.set(null);
          this.results.set(null);
          this.qrDataUrl.set(null);
          this.refreshSub?.unsubscribe();
          this.deleting.set(false);
          this.snackBar.open('Votación interna eliminada', 'Cerrar', { duration: 3000 });
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

  copyResults(): void {
    const r = this.results();
    if (!r) return;
    const lines = r.awards.map((award) => {
      const top = award.top.map((p, i) => `  ${this.podiumEmoji[i]} #${p.shirtNumber} ${p.playerName} — ${p.percentage}%`).join('\n');
      return `${award.awardName}:\n${top}`;
    });
    const text = [`Votación interna (${r.totalVoted}/${r.totalVoters} votos)`, ...lines].join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      this.snackBar.open('Resultados copiados', 'Cerrar', { duration: 2000 });
    });
  }
}
