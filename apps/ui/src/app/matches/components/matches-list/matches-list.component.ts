import {
  AfterViewInit,
  Component,
  inject,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AsyncPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { SetResultDialogComponent, SetResultDialogResult } from '../set-result-dialog/set-result-dialog.component';
import { MatchesService } from '../../services/matches.service';
import { MatchesDataSource } from '../../services/matches.datasource';
import { MatchFilters } from '../../forms/match-form.types';
import { MatchSearchComponent } from '../match-search/match-search.component';
import {
  CategoryEnum,
  Match,
  MatchStatusEnum,
  RoleEnum,
  SortOrder,
} from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../match-options';
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';
import { ListStateService } from '../../../common/services/list-state.service';

@Component({
  selector: 'ltrc-matches-list',
  standalone: true,
  imports: [
    MatTableModule,
    MatProgressBarModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatTooltipModule,
    MatMenuModule,
    MatDividerModule,
    MatSnackBarModule,
    MatDialogModule,
    AsyncPipe,
    DatePipe,
    MatchSearchComponent,
    AllowedRolesDirective,
  ],
  templateUrl: './matches-list.component.html',
  styleUrl: './matches-list.component.scss',
})
export class MatchesListComponent implements AfterViewInit, OnDestroy {
  private static readonly STATE_KEY = 'matches';
  private readonly router = inject(Router);
  private readonly matchesService = inject(MatchesService);
  private readonly listState = inject(ListStateService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly RoleEnum = RoleEnum;
  readonly MatchStatusEnum = MatchStatusEnum;
  readonly displayedColumns = [
    'date',
    'category',
    'opponent',
    'venue',
    'tournament',
    'result',
    'status',
    'attachments',
    'actions',
  ];
  readonly dataSource = new MatchesDataSource(this.matchesService);
  readonly savedState = this.listState.get(MatchesListComponent.STATE_KEY);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  private currentFilters: MatchFilters = this.savedState?.filters ?? {};
  private userSorted = !!this.savedState?.sortBy;

  constructor() {
    const s = this.savedState;
    this.dataSource.configure(s?.pageIndex ?? 0, s?.pageSize ?? 25, s?.sortBy, s?.sortOrder as SortOrder | undefined);
  }

  ngAfterViewInit(): void {
    const s = this.savedState;
    const pageIndex = s?.pageIndex ?? 0;
    const pageSize = s?.pageSize ?? 25;

    this.paginator.pageIndex = pageIndex;
    this.paginator.pageSize = pageSize;
    this.sort.sortChange.subscribe(() => {
      this.userSorted = true;
      this.paginator.pageIndex = 0;
      this.dataSource.setSorting(this.sort.active, this.sort.direction as SortOrder);
      this.saveState();
    });

    this.paginator.page.subscribe(() => {
      this.dataSource.setPage(this.paginator.pageIndex, this.paginator.pageSize);
      this.saveState();
    });

    this.dataSource.setFilters(this.currentFilters, pageIndex);
  }

  ngOnDestroy(): void {
    this.saveState();
  }

  applyFilters(filters: MatchFilters): void {
    this.currentFilters = filters;
    if (this.paginator) this.paginator.pageIndex = 0;
    this.dataSource.setFilters(filters);
    this.saveState();
  }

  private saveState(): void {
    this.listState.save(MatchesListComponent.STATE_KEY, {
      filters: this.currentFilters,
      pageIndex: this.paginator?.pageIndex ?? 0,
      pageSize: this.paginator?.pageSize ?? 25,
      sortBy: this.userSorted ? this.sort?.active : undefined,
      sortOrder: this.userSorted ? this.sort?.direction as SortOrder : undefined,
    });
  }

  goToCreate(): void {
    this.router.navigate(['/dashboard/matches/create']);
  }

  viewMatchDetails(matchId: string): void {
    this.router.navigate(['/dashboard/matches', matchId]);
  }

  goToSquad(event: Event, matchId: string): void {
    event.stopPropagation();
    this.router.navigate(['/dashboard/matches', matchId, 'squad']);
  }

  getStatusLabel(status: MatchStatusEnum): string {
    return this.matchesService.getStatusLabel(status);
  }

  getCategoryLabel(category?: CategoryEnum): string {
    return getCategoryLabel(category);
  }

  getAttendanceCount(match: Match): string {
    const players = (match.attendance ?? []).filter((a) => !a.isStaff && !!a.status);
    const present = players.filter((a) => a.status === 'present').length;
    if (present > 0) return `${present}/${players.length}`;
    return '';
  }

  getResultLabel(match: Match): string {
    if (!match.result) return '—';
    return `${match.result.homeScore} - ${match.result.awayScore}`;
  }

  isCompleted(status: MatchStatusEnum): boolean {
    return status === MatchStatusEnum.COMPLETED;
  }

  getAttachmentsTooltip(match: Match): string {
    return (match.attachments ?? [])
      .map((a) => `• ${a.name || a.filename}`)
      .join('\n');
  }

  getVideosTooltip(match: Match): string {
    return (match.videos ?? [])
      .map((v) => `• ${v.name}`)
      .join('\n');
  }

  openResultDialog(event: Event, match: Match): void {
    event.stopPropagation();
    const ref = this.dialog.open(SetResultDialogComponent, { data: { match }, width: '320px' });
    ref.afterClosed().subscribe((result: SetResultDialogResult | null) => {
      if (!result) return;
      this.matchesService.patchResult(match.id!, result.homeScore, result.awayScore).subscribe({
        next: (updated) => {
          this.snackBar.open('Resultado guardado', '', { duration: 2500 });
          this.dataSource.updateItem(updated);
        },
        error: () => this.snackBar.open('Error al guardar el resultado', 'Cerrar', { duration: 3000 }),
      });
    });
  }

  changeStatus(event: Event, match: Match, status: MatchStatusEnum): void {
    event.stopPropagation();
    this.matchesService.patchStatus(match.id!, status).subscribe({
      next: () => {
        this.snackBar.open('Estado actualizado', '', { duration: 2500 });
        this.dataSource.patchItem(match.id!, { status });
      },
      error: () => this.snackBar.open('Error al actualizar el estado', 'Cerrar', { duration: 3000 }),
    });
  }
}
