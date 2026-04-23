import { CommonModule } from '@angular/common';
import {
  Component,
  inject,
  OnInit,
  signal,
  computed,
  ViewChild,
  DestroyRef,
} from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { Router, RouterModule } from '@angular/router';
import { BlockEnum, CategoryEnum, getCategoryBlock, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { AllowedRolesDirective } from '../auth/directives/allowed-roles.directive';
import { AuthService } from '../auth/auth.service';
import { ViewAsRoleService } from '../auth/services/view-as-role.service';
import { getRoleLabel } from '../users/user-options';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { PlayersService } from '../players/services/players.service';
import { SidenavService } from '../common/services/sidenav.service';
import { CalendarWeekWidgetComponent } from '../calendar/components/calendar-week-widget/calendar-week-widget.component';
import { InjuredPlayersWidgetComponent } from '../players/components/injured-players-widget/injured-players-widget.component';
import { PlayerStatsWidgetComponent } from '../players/components/player-stats-widget/player-stats-widget.component';
import { AttendanceStatsWidgetComponent } from '../trainings/components/attendance-stats-widget/attendance-stats-widget.component';
import { MatchAttendanceStatsWidgetComponent } from '../matches/components/match-attendance-stats-widget/match-attendance-stats-widget.component';
import { MyWorkoutWidgetComponent } from '../physical-training/components/my-workout-widget/my-workout-widget.component';
import { EligibilityWidgetComponent } from '../player-fees/components/eligibility-widget/eligibility-widget.component';

@Component({
  selector: 'ltrc-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatListModule,
    AllowedRolesDirective,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    CalendarWeekWidgetComponent,
    InjuredPlayersWidgetComponent,
    PlayerStatsWidgetComponent,
    AttendanceStatsWidgetComponent,
    MatchAttendanceStatsWidgetComponent,
    MyWorkoutWidgetComponent,
    EligibilityWidgetComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  RoleEnum = RoleEnum;
  SportEnum = SportEnum;
  public authService = inject(AuthService);
  public router = inject(Router);
  readonly viewAsService = inject(ViewAsRoleService);
  private readonly playersService = inject(PlayersService);
  private readonly sidenavService = inject(SidenavService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('sidenav') sidenav!: MatSidenav;

  private readonly currentUser = toSignal(this.authService.user$);

  private check(r: RoleEnum): boolean {
    const viewAs = this.viewAsService.viewAsRole();
    const roles = this.currentUser()?.roles ?? [];
    return viewAs ? viewAs === r : roles.includes(r);
  }

  readonly isPlayer = computed(() => {
    const viewAs = this.viewAsService.viewAsRole();
    if (viewAs) return viewAs === RoleEnum.PLAYER;
    return this.currentUser()?.roles?.includes(RoleEnum.PLAYER) ?? false;
  });

  readonly isCoordinator = computed(() => {
    const viewAs = this.viewAsService.viewAsRole();
    if (viewAs) return viewAs === RoleEnum.COORDINATOR;
    return this.currentUser()?.roles?.includes(RoleEnum.COORDINATOR) ?? false;
  });

  readonly hasNoRoles = computed(() => {
    const viewAs = this.viewAsService.viewAsRole();
    if (viewAs) return false;
    return !this.currentUser()?.roles?.length;
  });

  readonly canSetPassword = computed(
    () => this.currentUser() !== null && !this.currentUser()?.hasPassword
  );

  readonly viewAsRoleLabel = computed(() => {
    const role = this.viewAsService.viewAsRole();
    return role ? getRoleLabel(role) : null;
  });

  // Widget visibility per role
  readonly showCalendar = computed(() =>
    this.check(RoleEnum.ADMIN) || this.check(RoleEnum.MANAGER) || this.check(RoleEnum.COORDINATOR) ||
    this.check(RoleEnum.COACH) || this.check(RoleEnum.TRAINER) || this.check(RoleEnum.ANALYST) ||
    this.check(RoleEnum.KINE) || this.check(RoleEnum.PLAYER)
  );

  readonly showInjured = computed(() =>
    this.check(RoleEnum.ADMIN) || this.check(RoleEnum.MANAGER) || this.check(RoleEnum.COORDINATOR) ||
    this.check(RoleEnum.COACH) || this.check(RoleEnum.TRAINER) || this.check(RoleEnum.ANALYST) ||
    this.check(RoleEnum.KINE)
  );

  readonly showPlayerStats = computed(() =>
    this.check(RoleEnum.ADMIN) || this.check(RoleEnum.MANAGER) ||
    this.check(RoleEnum.COORDINATOR) || this.check(RoleEnum.COACH)
  );

  readonly showTrainingStats = computed(() =>
    this.check(RoleEnum.ADMIN) || this.check(RoleEnum.MANAGER) ||
    this.check(RoleEnum.COORDINATOR) || this.check(RoleEnum.COACH) || this.check(RoleEnum.TRAINER)
  );

  readonly showMatchStats = computed(() =>
    this.check(RoleEnum.ADMIN) || this.check(RoleEnum.MANAGER) ||
    this.check(RoleEnum.COORDINATOR) || this.check(RoleEnum.COACH)
  );

  readonly showEligibility = computed(() =>
    this.check(RoleEnum.ADMIN) || this.check(RoleEnum.MANAGER) ||
    this.check(RoleEnum.COORDINATOR) || this.check(RoleEnum.COACH) ||
    this.check(RoleEnum.TRAINER)
  );

  myPlayerId = signal<string | null>(null);
  private myPlayerCategory = signal<CategoryEnum | null>(null);
  readonly isInfantil = computed(
    () => getCategoryBlock(this.myPlayerCategory() as CategoryEnum) === BlockEnum.INFANTILES
  );

  private readonly breakpointObserver = inject(BreakpointObserver);
  isSmallScreen = toSignal(
    this.breakpointObserver
      .observe('(max-width: 960px)')
      .pipe(map((result) => result.matches)),
    { initialValue: this.breakpointObserver.isMatched('(max-width: 960px)') }
  );

  onViewAsChange(role: RoleEnum | null): void {
    this.viewAsService.set(role);
  }

  onNavClick(): void {
    if (this.isSmallScreen()) {
      this.sidenav?.close();
    }
  }

  ngOnInit(): void {
    this.sidenavService.toggle$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.sidenav?.toggle());

    if (this.isPlayer()) {
      this.playersService.getMyPlayer().subscribe({
        next: (player) => {
          this.myPlayerId.set(player.id ?? null);
          this.myPlayerCategory.set((player.category as CategoryEnum) ?? null);
        },
        error: () => {
          /* jugador sin perfil vinculado */
        },
      });
    }
  }
}
