import { AfterViewInit, Component, inject, OnDestroy, ViewChild } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { whatsappUrl } from '../../../common/utils/contact.utils';
import { PlayersService } from '../../services/players.service';
import { PlayersDataSource } from '../../services/players.datasource';
import { PlayerFeesAdminService } from '../../../player-fees/services/player-fees-admin.service';
import {
  ImportResultDialogComponent,
  ImportResultDialogData,
} from '../../../common/components/import-result-dialog/import-result-dialog.component';
import {
  AvailabilityDialogComponent,
  AvailabilityDialogData,
  AvailabilityDialogResult,
} from '../availability-dialog/availability-dialog.component';
import {
  ChangeCategoryDialogComponent,
  ChangeCategoryDialogData,
} from '../change-category-dialog/change-category-dialog.component';
import {
  CategoryEnum,
  HockeyBranchEnum,
  Player,
  PlayerAvailabilityEnum,
  PlayerPosition,
  PlayerStatusEnum,
  RoleEnum,
  SortOrder,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import { AuthService } from '../../../auth/auth.service';
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';
import { categoryOptions } from '../../../common/category-options';
import { PlayerSearchComponent } from '../player-search/player-search.component';
import { Router } from '@angular/router';
import { ListStateService } from '../../../common/services/list-state.service';

@Component({
  selector: 'ltrc-players-list',
  standalone: true,
  imports: [
    AsyncPipe,
    MatTableModule,
    MatProgressBarModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatButtonModule,
    MatSnackBarModule,
    MatMenuModule,
    PlayerSearchComponent,
    AllowedRolesDirective,
    MatTooltipModule,
  ],
  templateUrl: './players-list.component.html',
  styleUrls: ['./players-list.component.scss'],
})
export class PlayersListComponent implements AfterViewInit, OnDestroy {
  private static readonly STATE_KEY = 'players';
  private readonly router = inject(Router);
  private readonly playersService = inject(PlayersService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly listState = inject(ListStateService);
  readonly authService = inject(AuthService);

  importing = false;
  readonly RoleEnum = RoleEnum;
  readonly PlayerStatusEnum = PlayerStatusEnum;
  readonly PlayerAvailabilityEnum = PlayerAvailabilityEnum;

  private readonly playerFeesService = inject(PlayerFeesAdminService);
  eligibilityMap = new Map<string, boolean>();

  private readonly baseColumns = ['photoId', 'name', 'nickName', 'idNumber', 'category'];
  private readonly afterCategoryColumns = ['positions', 'actions'];
  displayedColumns = [...this.baseColumns, ...this.afterCategoryColumns];
  showEligibilityColumn = false;

  readonly dataSource = new PlayersDataSource(this.playersService);
  readonly savedState = this.listState.get(PlayersListComponent.STATE_KEY);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  private currentFilters: Record<string, unknown> = this.savedState?.filters ?? {};

  constructor() {
    const s = this.savedState;
    this.dataSource.configure(s?.pageIndex ?? 0, s?.pageSize ?? 50, s?.sortBy || 'name', (s?.sortOrder || 'asc') as SortOrder);
  }

  ngAfterViewInit(): void {
    const s = this.savedState;
    const pageIndex = s?.pageIndex ?? 0;
    const pageSize = s?.pageSize ?? 50;

    this.paginator.pageIndex = pageIndex;
    this.paginator.pageSize = pageSize;

    this.sort.sortChange.subscribe(() => {
      this.paginator.pageIndex = 0;
      this.dataSource.setSorting(this.sort.active, this.sort.direction as SortOrder);
      this.saveState();
    });

    this.paginator.page.subscribe(() => {
      this.dataSource.setPage(this.paginator.pageIndex, this.paginator.pageSize);
      this.saveState();
    });

    this.updateColumns((this.currentFilters as any).sport);
    const savedSport = (this.currentFilters as any).sport as SportEnum | undefined;
    if (savedSport) {
      this.loadEligibility(savedSport, pageIndex);
    } else {
      this.dataSource.setFilters(this.currentFilters as any, pageIndex);
    }
  }

  ngOnDestroy(): void {
    this.saveState();
  }

  applyFilters(filters: {
    searchTerm?: string;
    sport?: SportEnum;
    position?: PlayerPosition;
    noPosition?: boolean;
    categories?: CategoryEnum[];
    availability?: PlayerAvailabilityEnum;
    eligible?: boolean;
  }): void {
    this.currentFilters = filters;
    if (this.paginator) this.paginator.pageIndex = 0;
    this.updateColumns(filters.sport);
    this.saveState();
    if (filters.sport) {
      this.loadEligibility(filters.sport);
    } else {
      this.eligibilityMap = new Map();
      this.dataSource.setFilters(filters as any);
    }
  }

  private saveState(): void {
    this.listState.save(PlayersListComponent.STATE_KEY, {
      filters: this.currentFilters,
      pageIndex: this.paginator?.pageIndex ?? 0,
      pageSize: this.paginator?.pageSize ?? 50,
      sortBy: this.sort?.active,
      sortOrder: this.sort?.direction as SortOrder,
    });
  }

  private updateColumns(sport?: SportEnum): void {
    this.showEligibilityColumn = !!sport;
    const middle = sport === SportEnum.HOCKEY ? ['branch'] : [];
    const eligCol = sport ? ['eligible'] : [];
    this.displayedColumns = [...this.baseColumns, ...middle, 'positions', ...eligCol, 'actions'];
  }

  private loadEligibility(sport: SportEnum, pageIndex = 0): void {
    const season = String(new Date().getFullYear());
    this.playerFeesService.getStatus({ season, sport }).subscribe({
      next: (rows) => {
        this.eligibilityMap = new Map(rows.map((r) => [r.playerId, r.eligible]));
        this.applyFiltersWithEligibility(pageIndex);
      },
      error: () => {
        this.dataSource.setFilters(this.currentFilters as any, pageIndex);
      },
    });
  }

  private applyFiltersWithEligibility(pageIndex = 0): void {
    const filters = this.currentFilters as any;
    const eligible: boolean | undefined = filters.eligible;
    if (eligible !== undefined && eligible !== null && this.eligibilityMap.size > 0) {
      const matchingIds = [...this.eligibilityMap.entries()]
        .filter(([, e]) => e === eligible)
        .map(([id]) => id);
      this.dataSource.setFilters({ ...filters, playerIds: matchingIds }, pageIndex);
    } else {
      const { playerIds: _, eligible: __, ...rest } = filters;
      this.dataSource.setFilters(rest, pageIndex);
    }
  }

  getEligibilityStatus(player: Player): { eligible: boolean } | null {
    if (!this.eligibilityMap.size) return null;
    const v = this.eligibilityMap.get(player.id!);
    return v !== undefined ? { eligible: v } : null;
  }

  getCategoryLabel(category?: CategoryEnum): string {
    if (!category) return '';
    return categoryOptions.find((c) => c.id === category)?.label ?? category;
  }

  goToCreate(): void {
    this.router.navigate(['/dashboard/players/create']);
  }

  viewPlayerDetails(playerId: string): void {
    this.router.navigate(['/dashboard/players', playerId]);
  }

  openAvailabilityDialog(event: Event, player: Player): void {
    event.stopPropagation();
    const dialogRef = this.dialog.open(AvailabilityDialogComponent, {
      width: '400px',
      data: { player } satisfies AvailabilityDialogData,
    });
    dialogRef.afterClosed().subscribe((result: AvailabilityDialogResult | undefined) => {
      if (!result) return;
      this.playersService.patchAvailability(player.id!, result.status, {
        reason: result.reason,
        since: result.since,
        estimatedReturn: result.estimatedReturn,
      }).subscribe({
        next: () => {
          this.dataSource.setPage(this.paginator.pageIndex, this.paginator.pageSize);
          this.snackBar.open('Disponibilidad actualizada', 'Cerrar', { duration: 3000 });
        },
        error: () => this.snackBar.open('Error al actualizar', 'Cerrar', { duration: 4000 }),
      });
    });
  }

  approveTrial(event: Event, player: Player): void {
    event.stopPropagation();
    this.playersService.patchStatus(player.id!, PlayerStatusEnum.ACTIVE).subscribe({
      next: () => {
        this.dataSource.setPage(this.paginator.pageIndex, this.paginator.pageSize);
        this.snackBar.open('Jugador registrado como socio activo', 'Cerrar', { duration: 3000 });
      },
      error: () => this.snackBar.open('Error al actualizar', 'Cerrar', { duration: 4000 }),
    });
  }

  openChangeCategoryDialog(event: Event, player: Player): void {
    event.stopPropagation();
    const dialogRef = this.dialog.open(ChangeCategoryDialogComponent, {
      width: '360px',
      data: { player } satisfies ChangeCategoryDialogData,
    });
    dialogRef.afterClosed().subscribe((category: string | undefined) => {
      if (!category) return;
      this.playersService.patchCategory(player.id!, category as any).subscribe({
        next: () => {
          this.dataSource.setPage(this.paginator.pageIndex, this.paginator.pageSize);
          this.snackBar.open('Categoría actualizada', 'Cerrar', { duration: 3000 });
        },
        error: () => this.snackBar.open('Error al actualizar', 'Cerrar', { duration: 4000 }),
      });
    });
  }

  getPositionsLabel(positions?: PlayerPosition[], sport?: SportEnum | null): string {
    if (!positions?.length) return '';
    return positions.map((p) => this.playersService.getPositionLabel(p, sport)).join(', ');
  }

  getPlayerPhotoUrl(playerId: string): string {
    return this.playersService.getPlayerPhotoUrl(playerId);
  }

  getTrialStatus(player: Player): 'expiring' | 'expired' | null {
    if (player.status !== PlayerStatusEnum.TRIAL || !player.trialStartDate) return null;
    const end = new Date(player.trialStartDate);
    end.setDate(end.getDate() + 14);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return 'expired';
    if (daysLeft <= 3) return 'expiring';
    return null;
  }

  onSurveyFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    this.importing = true;
    this.playersService.updateFromSurvey(file).subscribe({
      next: ({ updated, notFound, errors }) => {
        this.importing = false;
        if (notFound.length > 0 || errors.length > 0) {
          this.dialog.open(ImportResultDialogComponent, {
            width: '500px',
            data: {
              title: 'Resultado de encuesta',
              successCount: updated,
              successLabel: 'actualizados',
              notFound,
              errors,
            } satisfies ImportResultDialogData,
          });
        } else {
          this.snackBar.open(`${updated} actualizados`, 'Cerrar', {
            duration: 5000,
          });
        }
        this.dataSource.setPage(0, this.paginator.pageSize);
        this.paginator.pageIndex = 0;
      },
      error: () => {
        this.importing = false;
        this.snackBar.open('Error al procesar la encuesta', 'Cerrar', {
          duration: 5000,
        });
      },
    });
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    this.importing = true;
    this.playersService.importPlayers(file).subscribe({
      next: ({ created, updated, errors }) => {
        this.importing = false;
        const parts = [];
        if (created) parts.push(`${created} creados`);
        if (updated) parts.push(`${updated} actualizados`);
        const summary = parts.join(', ') || '0 cambios';
        if (errors.length > 0) {
          this.dialog.open(ImportResultDialogComponent, {
            width: '500px',
            data: {
              title: 'Resultado de importación',
              successCount: created + (updated ?? 0),
              successLabel: summary,
              errors,
            } satisfies ImportResultDialogData,
          });
        } else {
          this.snackBar.open(summary, 'Cerrar', {
            duration: 5000,
          });
        }
        this.dataSource.setPage(0, this.paginator.pageSize);
        this.paginator.pageIndex = 0;
      },
      error: () => {
        this.importing = false;
        this.snackBar.open('Error al importar el archivo', 'Cerrar', {
          duration: 5000,
        });
      },
    });
  }

  readonly whatsappUrl = whatsappUrl;
}
