import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { CategoryEnum, IPlayerFeeStatusRow, SportEnum } from '@ltrc-campo/shared-api-model';
import { UserFilterContextService } from '../../../common/services/user-filter-context.service';
import { PlayerFeesAdminService } from '../../services/player-fees-admin.service';
import { getCategoryLabel, getCategoryOptionsBySport } from '../../../common/category-options';
import { WidgetShellComponent } from '../../../common/components/widget-shell/widget-shell.component';

interface CategoryRow {
  category: CategoryEnum;
  label: string;
  eligible: number;
  notEligible: number;
  total: number;
}

interface SportSection {
  sport: SportEnum;
  label: string;
  rows: CategoryRow[];
  eligible: number;
  notEligible: number;
}

@Component({
  selector: 'ltrc-eligibility-widget',
  standalone: true,
  imports: [WidgetShellComponent],
  templateUrl: './eligibility-widget.component.html',
  styleUrl: './eligibility-widget.component.scss',
})
export class EligibilityWidgetComponent implements OnInit {
  private readonly filterContext = inject(UserFilterContextService);
  private readonly adminService = inject(PlayerFeesAdminService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly sections = signal<SportSection[]>([]);
  readonly totalEligible = signal(0);
  readonly totalNotEligible = signal(0);

  readonly season = String(new Date().getFullYear());

  ngOnInit(): void {
    this.filterContext.filterContext$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ctx) => {
        const sports = ctx.forcedSport
          ? [ctx.forcedSport]
          : ctx.sportOptions.map((s) => s.id as SportEnum);

        const allowedCategories = ctx.forcedCategory
          ? [ctx.forcedCategory]
          : ctx.categoryOptions.map((c) => c.id as CategoryEnum);

        if (!sports.length) {
          this.loading.set(false);
          return;
        }

        this.loading.set(true);

        const calls = sports.map((sport) =>
          this.adminService.getStatus({ season: this.season, sport }).pipe(
            catchError(() => of([] as IPlayerFeeStatusRow[]))
          )
        );

        forkJoin(calls)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((results) => {
            const built: SportSection[] = [];
            let totalElig = 0;
            let totalNot = 0;

            results.forEach((rows, i) => {
              const sport = sports[i];
              const sportCategoryIds = new Set(getCategoryOptionsBySport(sport).map((c) => c.id));
              const filtered = rows.filter((r) => {
                if (!sportCategoryIds.has(r.category as CategoryEnum)) return false;
                if (allowedCategories.length && !allowedCategories.includes(r.category as CategoryEnum)) return false;
                return true;
              });

              const catMap = new Map<CategoryEnum, { eligible: number; notEligible: number }>();
              for (const r of filtered) {
                const cat = r.category as CategoryEnum;
                const entry = catMap.get(cat) ?? { eligible: 0, notEligible: 0 };
                if (r.eligible) entry.eligible++; else entry.notEligible++;
                catMap.set(cat, entry);
              }

              const catRows: CategoryRow[] = [...catMap.entries()].map(([cat, counts]) => ({
                category: cat,
                label: getCategoryLabel(cat),
                eligible: counts.eligible,
                notEligible: counts.notEligible,
                total: counts.eligible + counts.notEligible,
              }));

              if (!catRows.length) return;

              const secElig = catRows.reduce((s, r) => s + r.eligible, 0);
              const secNot = catRows.reduce((s, r) => s + r.notEligible, 0);
              totalElig += secElig;
              totalNot += secNot;

              built.push({
                sport,
                label: sport === SportEnum.RUGBY ? 'Rugby' : 'Hockey',
                rows: catRows,
                eligible: secElig,
                notEligible: secNot,
              });
            });

            this.sections.set(built);
            this.totalEligible.set(totalElig);
            this.totalNotEligible.set(totalNot);
            this.loading.set(false);
          });
      });
  }

  goToFees(): void {
    this.router.navigate(['/dashboard/eligibility']);
  }
}
