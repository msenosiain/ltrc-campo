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
  MatchPollPublicInfo,
  PollPlayerResult,
  PollResults,
  PollSquadPlayer,
} from '@ltrc-campo/shared-api-model';
import { PollsPublicService } from '../../services/polls-public.service';

type PageState = 'loading' | 'ready' | 'voting' | 'voted' | 'not-started' | 'closed' | 'error';

const STORAGE_PREFIX = 'ltrc_poll_voted_';

@Component({
  selector: 'ltrc-voting-page',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './voting-page.component.html',
  styleUrl: './voting-page.component.scss',
})
export class VotingPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(PollsPublicService);
  private readonly destroyRef = inject(DestroyRef);

  token = '';
  state = signal<PageState>('loading');
  info = signal<MatchPollPublicInfo | null>(null);
  results = signal<PollResults | null>(null);
  selectedPlayer = signal<PollSquadPlayer | null>(null);
  errorMessage = '';

  ngOnInit(): void {
    const qualifier = this.route.snapshot.paramMap.get('qualifier');
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    this.token = qualifier ? `${qualifier}-${token}` : token;
    this.loadInfo();
  }

  private storageKey(): string {
    return `${STORAGE_PREFIX}${this.token}`;
  }

  private hasVotedLocally(): boolean {
    return !!localStorage.getItem(this.storageKey());
  }

  private markVotedLocally(playerId: string): void {
    localStorage.setItem(this.storageKey(), playerId);
  }

  private loadInfo(): void {
    this.service
      .getInfo(this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (info) => {
          this.info.set(info);
          if (!info.isActive && !info.isClosed) {
            this.state.set('not-started');
          } else if (info.isClosed) {
            this.state.set('closed');
            this.loadResults();
          } else if (this.hasVotedLocally()) {
            this.state.set('voted');
            this.loadResults();
          } else {
            this.state.set('ready');
          }
        },
        error: () => {
          this.state.set('error');
          this.errorMessage = 'Votación no encontrada.';
        },
      });
  }

  private loadResults(): void {
    this.service
      .getResults(this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (results) => this.results.set(results),
        error: () => { /* ignore */ },
      });
  }

  select(player: PollSquadPlayer): void {
    if (this.state() !== 'ready') return;
    this.selectedPlayer.set(player);
  }

  confirmVote(): void {
    const player = this.selectedPlayer();
    if (!player) return;
    this.state.set('voting');

    this.service
      .castVote(this.token, player.playerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.markVotedLocally(player.playerId);
          this.state.set('voted');
          this.loadResults();
        },
        error: (err) => {
          if (err.status === 409) {
            this.markVotedLocally('');
            this.state.set('voted');
            this.loadResults();
          } else if (err.status === 400 && err.error?.message?.includes('finalizado')) {
            this.state.set('closed');
            this.loadResults();
          } else {
            this.state.set('ready');
          }
        },
      });
  }

  getBarWidth(result: PollPlayerResult): string {
    return `${result.percentage}%`;
  }

  get podiumEmoji(): string[] {
    return ['🥇', '🥈', '🥉'];
  }
}
