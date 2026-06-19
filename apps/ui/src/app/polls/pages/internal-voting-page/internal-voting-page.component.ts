import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import {
  InternalPollAward,
  InternalPollInfo,
  InternalPollResults,
  InternalPollSquadPlayer,
} from '@ltrc-campo/shared-api-model';
import { InternalPollsVoterService } from '../../services/internal-polls-voter.service';

type PageState =
  | 'loading'
  | 'not-eligible'
  | 'not-started'
  | 'closed'
  | 'voting'
  | 'submitting'
  | 'voted'
  | 'error';

@Component({
  selector: 'ltrc-internal-voting-page',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './internal-voting-page.component.html',
  styleUrl: './internal-voting-page.component.scss',
})
export class InternalVotingPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(InternalPollsVoterService);
  private readonly destroyRef = inject(DestroyRef);

  matchId = '';
  state = signal<PageState>('loading');
  info = signal<InternalPollInfo | null>(null);
  results = signal<InternalPollResults | null>(null);
  errorMessage = '';

  // selections[awardId] = playerId
  selections = signal<Record<string, string>>({});
  currentAwardIndex = signal(0);

  readonly podiumEmoji = ['🥇', '🥈', '🥉'];

  ngOnInit(): void {
    this.matchId = this.route.snapshot.paramMap.get('matchId') ?? '';
    this.loadInfo();
  }

  get currentAward(): InternalPollAward | null {
    const awards = this.info()?.awards ?? [];
    return awards[this.currentAwardIndex()] ?? null;
  }

  get totalAwards(): number {
    return this.info()?.awards.length ?? 0;
  }

  get allSelected(): boolean {
    return this.totalAwards > 0 &&
      Object.keys(this.selections()).length === this.totalAwards;
  }

  private loadInfo(): void {
    this.service.getInfo(this.matchId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (info) => {
          this.info.set(info);
          if (!info.isEligible) {
            this.state.set('not-eligible');
          } else if (!info.isActive && !info.isClosed) {
            this.state.set('not-started');
          } else if (info.isClosed) {
            this.state.set('closed');
            this.loadResults();
          } else if (info.hasVoted) {
            // Pre-fill selections from already cast votes
            const sel: Record<string, string> = {};
            info.myVotes.forEach((v) => { sel[v.awardId] = v.playerId; });
            this.selections.set(sel);
            this.state.set('voted');
            this.loadResults();
          } else {
            this.state.set('voting');
          }
        },
        error: () => {
          this.state.set('error');
          this.errorMessage = 'No se encontró la votación o no tenés acceso.';
        },
      });
  }

  private loadResults(): void {
    this.service.getResults(this.matchId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (r) => this.results.set(r), error: () => {} });
  }

  selectPlayer(player: InternalPollSquadPlayer): void {
    const award = this.currentAward;
    if (!award) return;
    this.selections.update((sel) => ({ ...sel, [award.id]: player.playerId }));
  }

  isSelected(player: InternalPollSquadPlayer): boolean {
    const award = this.currentAward;
    if (!award) return false;
    return this.selections()[award.id] === player.playerId;
  }

  nextAward(): void {
    if (this.currentAwardIndex() < this.totalAwards - 1) {
      this.currentAwardIndex.update((i) => i + 1);
    }
  }

  prevAward(): void {
    if (this.currentAwardIndex() > 0) {
      this.currentAwardIndex.update((i) => i - 1);
    }
  }

  selectedPlayerName(awardId: string): string {
    const playerId = this.selections()[awardId];
    if (!playerId) return '';
    const player = this.info()?.squad.find((p) => p.playerId === playerId);
    return player ? `#${player.shirtNumber} ${player.playerName}` : '';
  }

  confirmVotes(): void {
    const votes = Object.entries(this.selections()).map(([awardId, playerId]) => ({ awardId, playerId }));
    this.state.set('submitting');

    this.service.castVotes(this.matchId, votes)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.state.set('voted');
          this.loadResults();
        },
        error: (err) => {
          if (err.status === 409) {
            this.state.set('voted');
            this.loadResults();
          } else if (err.status === 400 && err.error?.message?.includes('finalizado')) {
            this.state.set('closed');
            this.loadResults();
          } else {
            this.state.set('voting');
          }
        },
      });
  }
}
