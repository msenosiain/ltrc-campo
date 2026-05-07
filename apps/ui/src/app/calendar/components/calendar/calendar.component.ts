import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CalendarEvent, CategoryEnum, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { CalendarService } from '../../services/calendar.service';
import { TrainingSessionsService } from '../../../trainings/services/training-sessions.service';
import { AuthService } from '../../../auth/auth.service';
import { getCategoryLabel } from '../../../common/category-options';
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

interface DayGroup {
  dateKey: string;      // YYYY-MM-DD
  dateLabel: string;    // dd/MM
  dayName: string;      // Lunes, Martes…
  events: CalendarEvent[];
}

function getWeekBounds(date: Date): { from: Date; to: Date } {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  const from = new Date(d);
  from.setDate(d.getDate() + diff);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'ltrc-calendar',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressBarModule, MatSnackBarModule, AllowedRolesDirective],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss',
})
export class CalendarComponent implements OnInit {
  private readonly calendarService = inject(CalendarService);
  private readonly sessionsService = inject(TrainingSessionsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snackBar = inject(MatSnackBar);

  readonly SportEnum = SportEnum;
  readonly confirmRoles = [RoleEnum.PLAYER, RoleEnum.COACH, RoleEnum.TRAINER, RoleEnum.MANAGER];

  loading = signal(false);
  weekAnchor = signal(new Date());
  days = signal<DayGroup[]>([]);
  confirmedIds = signal(new Set<string>());
  confirmingId = signal<string | null>(null);

  get weekLabel(): string {
    const { from, to } = getWeekBounds(this.weekAnchor());
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${fmt(from)} – ${fmt(to)} ${to.getFullYear()}`;
  }

  ngOnInit(): void {
    this.loadWeek();
  }

  prevWeek(): void {
    const d = new Date(this.weekAnchor());
    d.setDate(d.getDate() - 7);
    this.weekAnchor.set(d);
    this.loadWeek();
  }

  nextWeek(): void {
    const d = new Date(this.weekAnchor());
    d.setDate(d.getDate() + 7);
    this.weekAnchor.set(d);
    this.loadWeek();
  }

  goToToday(): void {
    this.weekAnchor.set(new Date());
    this.loadWeek();
  }

  private loadWeek(): void {
    const { from, to } = getWeekBounds(this.weekAnchor());
    this.loading.set(true);
    this.calendarService
      .getEvents(toDateStr(from), toDateStr(to))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (events) => {
          this.days.set(this.groupByDay(events, from));
          const confirmed = new Set(
            events.filter((e) => e.type === 'training' && e.userConfirmed).map((e) => e.id)
          );
          this.confirmedIds.set(confirmed);
          this.loading.set(false);
        },
        error: () => {
          this.days.set([]);
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

  private groupByDay(events: CalendarEvent[], weekStart: Date): DayGroup[] {
    const groups: DayGroup[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const key = toDateStr(d);
      const dayEvents = events.filter((e) => e.date.slice(0, 10) === key);
      if (dayEvents.length > 0) {
        groups.push({
          dateKey: key,
          dateLabel: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
          dayName: DAY_NAMES[d.getDay()],
          events: dayEvents,
        });
      }
    }
    return groups;
  }

  getEventTime(event: CalendarEvent): string {
    if (event.type === 'training') {
      return event.startTime ?? '';
    }
    const d = new Date(event.date);
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  getCategoryLabel(category?: CategoryEnum): string {
    return category ? getCategoryLabel(category) : '';
  }

  navigate(event: CalendarEvent): void {
    if (event.type === 'match') {
      this.router.navigate(['/dashboard/matches', event.id]);
    } else if (event.type === 'trip') {
      this.router.navigate(['/dashboard/trips', event.id]);
    } else {
      this.router.navigate(['/dashboard/trainings/sessions', event.id]);
    }
  }
}
