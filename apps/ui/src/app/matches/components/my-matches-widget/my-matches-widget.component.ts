import { Component, inject, OnInit, DestroyRef, signal } from '@angular/core';
import { Router } from '@angular/router';
import { format } from 'date-fns';
import { Match, MatchStatusEnum, SortOrder } from '@ltrc-campo/shared-api-model';
import { MatchesService } from '../../services/matches.service';
import { getCategoryLabel } from '../../match-options';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WidgetShellComponent } from '../../../common/components/widget-shell/widget-shell.component';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

interface GroupedMatches {
  date: string;
  dayLabel: string;
  matches: Match[];
}

@Component({
  selector: 'ltrc-my-matches-widget',
  standalone: true,
  imports: [WidgetShellComponent],
  templateUrl: './my-matches-widget.component.html',
  styleUrl: './my-matches-widget.component.scss',
})
export class MyMatchesWidgetComponent implements OnInit {
  private readonly matchesService = inject(MatchesService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  grouped: GroupedMatches[] = [];
  loading = signal(true);

  ngOnInit(): void {
    this.matchesService.getMySquadMatches({
      page: 1,
      size: 20,
      filters: { status: MatchStatusEnum.UPCOMING, fromDate: format(new Date(), 'yyyy-MM-dd') },
      sortBy: 'date',
      sortOrder: SortOrder.ASC,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.grouped = this.groupByDate(res.items);
        this.loading.set(false);
      },
      error: () => {
        this.grouped = [];
        this.loading.set(false);
      },
    });
  }

  private groupByDate(matches: Match[]): GroupedMatches[] {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      const key = m.date!;
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return Array.from(map.entries()).map(([dateKey, items]) => {
      const d = new Date(dateKey + 'T12:00:00');
      let dayLabel: string;
      if (d.toDateString() === today.toDateString()) {
        dayLabel = 'Hoy';
      } else if (d.toDateString() === tomorrow.toDateString()) {
        dayLabel = 'Mañana';
      } else {
        dayLabel = DAY_NAMES[d.getDay()];
      }
      const [y, mo, day] = dateKey.split('-');
      return { date: `${day}/${mo}/${y}`, dayLabel, matches: items };
    });
  }

  getCategoryLabel(match: Match): string {
    return getCategoryLabel(match.category);
  }

  hasTime(match: Match): boolean {
    return !!match.time;
  }

  goToMatch(matchId: string): void {
    this.router.navigate(['/dashboard/matches', matchId]);
  }
}
