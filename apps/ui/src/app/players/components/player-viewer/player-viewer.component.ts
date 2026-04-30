import {
  Component,
  computed,
  HostListener,
  inject,
  OnInit,
  DestroyRef,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { whatsappUrl } from '../../../common/utils/contact.utils';
import { PlayersService } from '../../services/players.service';
import { MatchesService } from '../../../matches/services/matches.service';
import { AuthService } from '../../../auth/auth.service';
import {
  CategoryEnum,
  HockeyBranchEnum,
  Match,
  Player,
  PlayerAvailabilityEnum,
  PlayerPosition,
  PlayerStatusEnum,
  RoleEnum,
  SortOrder,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import { categoryOptions } from '../../../common/category-options';
import { getBranchLabel } from '../../../common/branch-options';
import { getSportLabel } from '../../../common/sport-options';
import {
  getStatusLabel,
  getAvailabilityLabel,
  getAvailabilityColor,
} from '../../player-status-options';
import { getCategoryLabel as getMatchCategoryLabel } from '../../../matches/match-options';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';
import { AvailabilityDialogComponent, AvailabilityDialogResult } from '../availability-dialog/availability-dialog.component';
import { PlayerFeesAdminService } from '../../../player-fees/services/player-fees-admin.service';
import { IPlayerFeeStatusRow } from '@ltrc-campo/shared-api-model';

@Component({
  selector: 'ltrc-player-viewer',
  standalone: true,
  imports: [
    MatCardModule,
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatSelectModule,
    MatFormFieldModule,
    DatePipe,
    AllowedRolesDirective,
    MatTooltipModule,
  ],
  templateUrl: './player-viewer.component.html',
  styleUrl: './player-viewer.component.scss',
})
export class PlayerViewerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly playersService = inject(PlayersService);
  private readonly matchesService = inject(MatchesService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly playerFeesService = inject(PlayerFeesAdminService);

  RoleEnum = RoleEnum;
  readonly PlayerStatusEnum = PlayerStatusEnum;
  readonly SportEnum = SportEnum;
  player?: Player;
  loading = signal(false);

  private readonly currentUser = toSignal(this.authService.user$);
  readonly isAdmin = computed(() => {
    const user = this.currentUser();
    return !!user?.roles?.includes(RoleEnum.ADMIN);
  });
  matchHistory: Match[] = [];
  matchHistoryLoading = signal(false);
  isOwnProfile = signal(false);
  eligibilityStatus = signal<IPlayerFeeStatusRow | null>(null);
  readonly fichajeSeasonOptions = (() => {
    const y = new Date().getFullYear();
    return [String(y + 1), String(y), String(y - 1)];
  })();
  fichajeSeason = signal(String(new Date().getFullYear()));

  ngOnInit(): void {
    const playerId = this.route.snapshot.paramMap.get('id');

    if (!playerId) {
      this.router.navigate(['/players']);
      return;
    }

    this.loading.set(true);
    this.playersService
      .getPlayerById(playerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (player) => {
          this.player = player;
          this.loading.set(false);
          this.loadMatchHistory(playerId);
          this.checkOwnProfile(player);
          this.loadFeeStatus(playerId);
        },
        error: () => { this.loading.set(false); this.router.navigate(['/players']); },
      });
  }

  private checkOwnProfile(player: Player): void {
    this.authService.user$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((user) => {
      if (!user) return;
      const isPlayer = user.roles?.includes(RoleEnum.PLAYER) ?? false;
      if (!isPlayer) return;
      this.playersService.getMyPlayer().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (myPlayer) => this.isOwnProfile.set(myPlayer.id === player.id),
        error: () => {},
      });
    });
  }

  private loadMatchHistory(playerId: string): void {
    this.matchHistoryLoading.set(true);
    this.matchesService.getMatches({
      page: 1,
      size: 10,
      filters: { playerId },
      sortBy: 'date',
      sortOrder: SortOrder.DESC,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.matchHistory = res.items;
        this.matchHistoryLoading.set(false);
      },
      error: () => { this.matchHistoryLoading.set(false); },
    });
  }

  onFichajeSeason(season: string): void {
    this.fichajeSeason.set(season);
    if (this.player?.id) this.loadFeeStatus(this.player.id);
  }

  private loadFeeStatus(playerId: string): void {
    this.playerFeesService.getPlayerStatus(playerId, this.fichajeSeason())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.eligibilityStatus.set(rows[0] ?? null),
        error: () => {},
      });
  }

  openAvailabilityDialog(): void {
    const ref = this.dialog.open(AvailabilityDialogComponent, {
      width: '440px',
      data: { player: this.player },
    });
    ref.afterClosed().subscribe((result: AvailabilityDialogResult | undefined) => {
      if (!result) return;
      this.playersService.updateAvailability(this.player!.id!, result).subscribe({
        next: (updated) => {
          this.player = updated;
          this.snackBar.open('Disponibilidad actualizada', 'Cerrar', { duration: 3000 });
        },
        error: () => this.snackBar.open('Error al actualizar', 'Cerrar', { duration: 4000 }),
      });
    });
  }

  edit(): void {
    this.router.navigate(['/dashboard/players', this.player!.id, 'edit']);
  }

  editMyProfile(): void {
    this.router.navigate(['/dashboard/players/me/edit']);
  }

  getMatchCategoryLabel(match: Match): string {
    return getMatchCategoryLabel(match.category);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.backToList();
  }

  backToList(): void {
    this.router.navigate(['/dashboard/players']);
  }

  getPlayerPhotoUrl(playerId?: string): string {
    return playerId
      ? this.playersService.getPlayerPhotoUrl(playerId)
      : '/placeholder.jpg';
  }

  getCategoryLabel(category?: CategoryEnum): string {
    if (!category) return '';
    return categoryOptions.find((c) => c.id === category)?.label ?? category;
  }

  getPositionLabel(position: PlayerPosition, sport?: SportEnum | null): string {
    return this.playersService.getPositionLabel(position, sport);
  }

  getPlayerAge(birthDate: Date): number {
    return this.playersService.calculatePlayerAge(birthDate);
  }

  getBranchLabel(branch?: HockeyBranchEnum | null): string {
    return getBranchLabel(branch);
  }

  getSportLabel(sport?: SportEnum | null): string {
    return getSportLabel(sport);
  }

  getStatusLabel(status?: PlayerStatusEnum): string {
    return getStatusLabel(status);
  }

  getAvailabilityLabel(status?: PlayerAvailabilityEnum): string {
    return getAvailabilityLabel(status);
  }

  getAvailabilityColor(status?: PlayerAvailabilityEnum): string {
    return getAvailabilityColor(status);
  }

  get isUnavailable(): boolean {
    return (
      !!this.player?.availability?.status &&
      this.player.availability.status !== PlayerAvailabilityEnum.AVAILABLE
    );
  }

  get isInactive(): boolean {
    return this.player?.status === PlayerStatusEnum.INACTIVE;
  }

  readonly whatsappUrl = whatsappUrl;

  getTrialInfo(): { endDate: Date; daysLeft: number; expired: boolean } | null {
    const player = this.player;
    if (player?.status !== PlayerStatusEnum.TRIAL || !player.trialStartDate) return null;
    const start = new Date(player.trialStartDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return { endDate: end, daysLeft, expired: daysLeft < 0 };
  }
}
