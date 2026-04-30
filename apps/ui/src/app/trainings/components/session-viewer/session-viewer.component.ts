import {
  Component,
  HostListener,
  inject,
  OnInit,
  DestroyRef,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AttendanceEntry,
  PlayerAvailabilityEnum,
  PlayerStatusEnum,
  RoleEnum,
  RugbyPositions,
  SportEnum,
  TrainingSession,
  TrainingSessionStatusEnum,
} from '@ltrc-campo/shared-api-model';
import { TrainingSessionsService } from '../../services/training-sessions.service';
import { EvaluationsService } from '../../../evaluations/services/evaluations.service';
import {
  getAttendanceStatusLabel,
  getCategoryLabel,
  getSessionStatusLabel,
} from '../../training-options';
import { getSportLabel } from '../../../common/sport-options';
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SessionEditDialogComponent, SessionEditDialogResult } from '../session-edit-dialog/session-edit-dialog.component';

@Component({
  selector: 'ltrc-session-viewer',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
    DatePipe,
    AllowedRolesDirective,
  ],
  templateUrl: './session-viewer.component.html',
  styleUrl: './session-viewer.component.scss',
})
export class SessionViewerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sessionsService = inject(TrainingSessionsService);
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  session?: TrainingSession;
  loading = signal(false);
  evaluationsEnabled = false;
  readonly RoleEnum = RoleEnum;
  readonly TrainingSessionStatusEnum = TrainingSessionStatusEnum;
  readonly PlayerStatusEnum = PlayerStatusEnum;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/dashboard/trainings/sessions']);
      return;
    }

    this.loading.set(true);
    this.sessionsService
      .getSessionById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.session = session;
          this.loading.set(false);
          this.checkEvaluationsEnabled(session);
        },
        error: () => { this.loading.set(false); this.router.navigate(['/dashboard/trainings/sessions']); },
      });
  }

  getSportLabel(): string {
    return getSportLabel(this.session?.sport);
  }

  getCategoryLabel(): string {
    return getCategoryLabel(this.session?.category);
  }

  getStatusLabel(): string {
    return getSessionStatusLabel(this.session?.status);
  }

  getAttendanceStatusLabel(entry: AttendanceEntry): string {
    return getAttendanceStatusLabel(entry.status);
  }

  get playerAttendance(): AttendanceEntry[] {
    return (this.session?.attendance ?? []).filter((a) => !a.isStaff && !!a.status);
  }

  get staffAttendance(): AttendanceEntry[] {
    return (this.session?.attendance ?? []).filter((a) => a.isStaff && !!a.status);
  }

  get confirmedCount(): number {
    return (this.session?.attendance ?? []).filter((a) => a.confirmed).length;
  }

  get isRugby(): boolean {
    return this.session?.sport === SportEnum.RUGBY;
  }

  get confirmedBreakdown(): { forwards: number; backs: number; injured: number; others: number } {
    const confirmed = (this.session?.attendance ?? []).filter((a) => !a.isStaff && a.confirmed);
    let forwards = 0, backs = 0, injured = 0, others = 0;
    const forwardPositions = new Set<string>([
      RugbyPositions.LOOSE_HEAD_PROP, RugbyPositions.HOOKER, RugbyPositions.TIGHT_HEAD_PROP,
      RugbyPositions.LEFT_SECOND_ROW, RugbyPositions.RIGHT_SECOND_ROW,
      RugbyPositions.BLINDSIDE_FLANKER, RugbyPositions.OPEN_SIDE_FLANKER, RugbyPositions.NUMBER_8,
    ]);
    for (const entry of confirmed) {
      const player = entry.player as any;
      if (!player) { others++; continue; }
      if (player.availability?.status === PlayerAvailabilityEnum.INJURED) { injured++; continue; }
      const primaryPos = player.positions?.[0];
      if (!primaryPos) { others++; continue; }
      if (forwardPositions.has(primaryPos)) forwards++;
      else backs++;
    }
    return { forwards, backs, injured, others };
  }

  get dayName(): string {
    const date = this.session?.date as unknown as string | undefined;
    if (!date) return '';
    const d = new Date(date + 'T12:00:00Z');
    return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d.getUTCDay()];
  }

  get presentCount(): number {
    return (this.session?.attendance ?? []).filter(
      (a) => !a.isStaff && a.status === 'present'
    ).length;
  }

  get presentStaffCount(): number {
    return this.staffAttendance.filter((a) => a.status === 'present').length;
  }

  getPlayerName(entry: AttendanceEntry): string {
    if (entry.isStaff) return entry.userName ?? '—';
    const player = entry.player as any;
    if (!player) return '—';
    return player.name ?? `${player.lastName}, ${player.firstName}`;
  }

  goToEvaluate(): void {
    this.router.navigate([
      '/dashboard/trainings/sessions',
      this.session!.id,
      'evaluate',
    ]);
  }

  private checkEvaluationsEnabled(session: TrainingSession): void {
    this.evaluationsService
      .getAllSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          const match = settings.find(
            (s) => s.category === session.category && s.sport === session.sport
          );
          this.evaluationsEnabled = match?.evaluationsEnabled ?? false;
        },
        error: () => { this.evaluationsEnabled = false; },
      });
  }

  goToAttendance(): void {
    this.router.navigate([
      '/dashboard/trainings/sessions',
      this.session!.id,
      'attendance',
    ]);
  }

  openEditDialog(): void {
    const ref = this.dialog.open(SessionEditDialogComponent, {
      width: '400px',
      data: { session: this.session },
    });
    ref.afterClosed().subscribe((result: SessionEditDialogResult | undefined) => {
      if (!result) return;
      this.sessionsService.updateSession(this.session!.id!, result).subscribe({
        next: (updated) => {
          this.session = updated;
          this.snackBar.open('Sesión actualizada', 'Cerrar', { duration: 3000 });
        },
        error: () => this.snackBar.open('Error al actualizar', 'Cerrar', { duration: 4000 }),
      });
    });
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.backToList();
  }

  backToList(): void {
    this.router.navigate(['/dashboard/trainings/sessions']);
  }
}
