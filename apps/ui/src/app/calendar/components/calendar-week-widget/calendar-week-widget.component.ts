import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CalendarEvent, CategoryEnum, HockeyBranchEnum, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { CalendarService } from '../../services/calendar.service';
import { TrainingSessionsService } from '../../../trainings/services/training-sessions.service';
import { getCategoryLabel } from '../../../common/category-options';
import { getBranchLabel } from '../../../common/branch-options';
import { UserFilterContextService, FilterContext } from '../../../common/services/user-filter-context.service';
import {
  ScopeFilterDialogComponent,
  ScopeFilterDialogData,
  ScopeFilterSelection,
} from '../../../common/components/scope-filter-dialog/scope-filter-dialog.component';
import { WidgetShellComponent } from '../../../common/components/widget-shell/widget-shell.component';
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

interface DayGroup {
  dateKey: string;
  dateLabel: string;
  dayName: string;
  events: CalendarEvent[];
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekBounds(): { weekStart: Date; weekEnd: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return { weekStart, weekEnd };
}

@Component({
  selector: 'ltrc-calendar-week-widget',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatExpansionModule, MatSnackBarModule, WidgetShellComponent, AllowedRolesDirective],
  templateUrl: './calendar-week-widget.component.html',
  styleUrl: './calendar-week-widget.component.scss',
})
export class CalendarWeekWidgetComponent implements OnInit {
  private readonly calendarService = inject(CalendarService);
  private readonly sessionsService = inject(TrainingSessionsService);
  private readonly filterContextService = inject(UserFilterContextService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snackBar = inject(MatSnackBar);

  readonly SportEnum = SportEnum;
  readonly confirmRoles = [RoleEnum.PLAYER, RoleEnum.COACH, RoleEnum.TRAINER, RoleEnum.MANAGER];

  loading = signal(true);
  days: DayGroup[] = [];
  confirmedIds = signal(new Set<string>());
  confirmingId = signal<string | null>(null);

  private filterContext: FilterContext | null = null;
  private selected: ScopeFilterSelection = {};

  get hasFilters(): boolean {
    return !!(this.selected.sport || this.selected.category || this.selected.branch);
  }

  get showFilterButton(): boolean {
    if (!this.filterContext) return false;
    return (
      this.filterContext.sportOptions.length > 1 ||
      this.filterContext.categoryOptions.length > 1 ||
      (this.filterContext.showBranchFilter && this.filterContext.branchOptions.length > 1)
    );
  }

  ngOnInit(): void {
    this.filterContextService.filterContext$
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((ctx) => {
        this.filterContext = ctx;
        if (ctx.forcedSport) this.selected = { ...this.selected, sport: ctx.forcedSport };
        if (ctx.forcedCategory) this.selected = { ...this.selected, category: ctx.forcedCategory };
        if (ctx.forcedBranch) this.selected = { ...this.selected, branch: ctx.forcedBranch };
        this.load();
      });
  }

  openFilters(): void {
    if (!this.filterContext) return;
    const ref = this.dialog.open(ScopeFilterDialogComponent, {
      width: '320px',
      data: { filterContext: this.filterContext, selected: { ...this.selected } } satisfies ScopeFilterDialogData,
    });
    ref.afterClosed().subscribe((result: ScopeFilterSelection | undefined) => {
      if (result === undefined) return;
      this.selected = result;
      this.load();
    });
  }

  private load(): void {
    const { weekStart, weekEnd } = getWeekBounds();
    this.loading.set(true);
    this.calendarService
      .getEvents(toDateStr(weekStart), toDateStr(weekEnd), this.selected.sport, this.selected.category)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (events) => {
          this.days = this.groupByDay(events, weekStart, weekEnd);
          this.confirmedIds.set(new Set(
            events.filter((e) => e.type === 'training' && e.userConfirmed).map((e) => e.id)
          ));
          this.loading.set(false);
        },
        error: () => {
          this.days = [];
          this.loading.set(false);
        },
      });
  }

  isConfirmed(eventId: string): boolean {
    return this.confirmedIds().has(eventId);
  }

  toggleConfirm(event: CalendarEvent, $event: Event): void {
    $event.stopPropagation();
    if (this.confirmingId()) return;
    this.confirmingId.set(event.id);
    const action = this.isConfirmed(event.id)
      ? this.sessionsService.cancelConfirmation(event.id)
      : this.sessionsService.confirmAttendance(event.id);
    action.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        const next = new Set(this.confirmedIds());
        if (this.isConfirmed(event.id)) next.delete(event.id);
        else next.add(event.id);
        this.confirmedIds.set(next);
        this.confirmingId.set(null);
      },
      error: () => {
        this.snackBar.open('Error al actualizar la confirmación', 'Cerrar', { duration: 4000 });
        this.confirmingId.set(null);
      },
    });
  }

  private groupByDay(events: CalendarEvent[], from: Date, to: Date): DayGroup[] {
    const todayStr = toDateStr(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = toDateStr(tomorrow);
    const groups: DayGroup[] = [];

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const key = toDateStr(d);
      const dayEvents = events.filter((e) => e.date.slice(0, 10) === key);
      if (dayEvents.length === 0) continue;

      let dayName: string;
      if (key === todayStr) dayName = 'Hoy';
      else if (key === tomorrowStr) dayName = 'Mañana';
      else dayName = DAY_NAMES[d.getDay()];

      groups.push({
        dateKey: key,
        dateLabel: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        dayName,
        events: dayEvents,
      });
    }
    return groups;
  }

  getEventTime(event: CalendarEvent): string {
    if (event.type === 'training') return event.startTime ?? '';
    const d = new Date(event.date);
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  getCategoryLabel(category?: CategoryEnum): string {
    return category ? getCategoryLabel(category) : '';
  }

  getEventTitle(event: CalendarEvent): string {
    if (event.type === 'trip') {
      return event.destination ? `${event.title} — ${event.destination}` : event.title;
    }
    if (event.type === 'training') {
      const parts = ['Entrenamiento', event.category ? getCategoryLabel(event.category) : ''].filter(Boolean);
      if (event.branch) parts.push(getBranchLabel(event.branch));
      return parts.join(' ');
    }

    // match
    let descriptor: string;
    if (event.sport === SportEnum.RUGBY) {
      descriptor = event.division || (event.category ? getCategoryLabel(event.category) : '');
    } else {
      const parts = event.category ? [getCategoryLabel(event.category)] : [];
      if (event.branch) parts.push(getBranchLabel(event.branch));
      descriptor = parts.join(' ');
    }

    return event.opponent ? `${descriptor} vs ${event.opponent}` : descriptor;
  }

  navigate(event: CalendarEvent): void {
    if (event.type === 'match') {
      this.router.navigate(['/dashboard/matches', event.id]);
    } else {
      this.router.navigate(['/dashboard/trainings/sessions', event.id]);
    }
  }

  goToCalendar(): void {
    this.router.navigate(['/dashboard/calendar']);
  }
}
