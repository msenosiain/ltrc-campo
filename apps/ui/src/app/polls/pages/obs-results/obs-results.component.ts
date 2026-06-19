import { Component, DestroyRef, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PollResults } from '@ltrc-campo/shared-api-model';
import { PollsPublicService } from '../../services/polls-public.service';

@Component({
  selector: 'ltrc-obs-results',
  standalone: true,
  imports: [],
  templateUrl: './obs-results.component.html',
  styleUrl: './obs-results.component.scss',
})
export class ObsResultsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(PollsPublicService);
  private readonly destroyRef = inject(DestroyRef);

  results = signal<PollResults | null>(null);
  private token = '';
  private timer?: ReturnType<typeof setInterval>;

  readonly MEDALS = ['🥇', '🥈', '🥉'];

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.fetchResults();
    this.timer = setInterval(() => this.fetchResults(), 10000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private fetchResults(): void {
    this.service
      .getResults(this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => this.results.set(r),
        error: () => {},
      });
  }

  barWidth(pct: number): string {
    return `${pct}%`;
  }
}
