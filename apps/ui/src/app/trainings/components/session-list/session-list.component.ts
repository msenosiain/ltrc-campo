import {
  AfterViewInit,
  ChangeDetectorRef,
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
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AsyncPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  RoleEnum,
  SortOrder,
  TrainingSession,
  TrainingSessionFilters,
  TrainingSessionStatusEnum,
} from '@ltrc-campo/shared-api-model';
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';
import { TrainingSessionsService } from '../../services/training-sessions.service';
import { SessionsDataSource } from '../../services/sessions.datasource';
import { SessionSearchComponent } from '../session-search/session-search.component';
import { ListStateService } from '../../../common/services/list-state.service';
import {
  getCategoryLabel,
  getSessionStatusLabel,
} from '../../training-options';

@Component({
  selector: 'ltrc-session-list',
  standalone: true,
  imports: [
    MatTableModule,
    MatProgressBarModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatSnackBarModule,
    AsyncPipe,
    DatePipe,
    SessionSearchComponent,
    AllowedRolesDirective,
  ],
  templateUrl: './session-list.component.html',
  styleUrl: './session-list.component.scss',
})
export class SessionListComponent implements AfterViewInit, OnDestroy {
  private static readonly STATE_KEY = 'training-sessions';
  private readonly router = inject(Router);
  private readonly sessionsService = inject(TrainingSessionsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly listState = inject(ListStateService);
  private readonly snackBar = inject(MatSnackBar);

  readonly displayedColumns = [
    'date',
    'category',
    'location',
    'attendance',
    'status',
    'actions',
  ];

  readonly RoleEnum = RoleEnum;
  readonly TrainingSessionStatusEnum = TrainingSessionStatusEnum;
  readonly dataSource = new SessionsDataSource(this.sessionsService);
  readonly savedState = this.listState.get(SessionListComponent.STATE_KEY);

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  private currentFilters: TrainingSessionFilters =
    this.savedState?.filters ?? {};

  ngAfterViewInit(): void {
    const s = this.savedState;
    const pageIndex = s?.pageIndex ?? 0;
    const pageSize = s?.pageSize ?? 25;
    const sortBy = s?.sortBy;
    const sortOrder = s?.sortOrder as SortOrder | undefined;

    this.paginator.pageIndex = pageIndex;
    this.paginator.pageSize = pageSize;
    this.sort.active = sortBy ?? '';
    this.sort.direction = sortOrder as '' | 'asc' | 'desc';

    this.dataSource.configure(pageIndex, pageSize, sortBy, sortOrder);
    this.dataSource.load();
    this.cdr.detectChanges();

    this.sort.sortChange.subscribe(() => {
      this.paginator.pageIndex = 0;
      this.dataSource.setSorting(
        this.sort.active,
        this.sort.direction as SortOrder
      );
      this.saveState();
    });

    this.paginator.page.subscribe(() => {
      this.dataSource.setPage(
        this.paginator.pageIndex,
        this.paginator.pageSize
      );
      this.saveState();
    });
  }

  ngOnDestroy(): void {
    this.saveState();
  }

  applyFilters(filters: TrainingSessionFilters): void {
    this.currentFilters = filters;
    if (this.paginator) {
      this.paginator.pageIndex = 0;
    }
    this.dataSource.setFilters(filters);
    this.saveState();
  }

  private saveState(): void {
    this.listState.save(SessionListComponent.STATE_KEY, {
      filters: this.currentFilters,
      pageIndex: this.paginator?.pageIndex ?? 0,
      pageSize: this.paginator?.pageSize ?? 25,
      sortBy: this.sort?.active,
      sortOrder: this.sort?.direction as SortOrder,
    });
  }

  viewDetails(id: string): void {
    this.router.navigate(['/dashboard/trainings/sessions', id]);
  }

  goToRollCall(event: Event, id: string): void {
    event.stopPropagation();
    this.router.navigate(['/dashboard/trainings/sessions', id, 'attendance']);
  }

  changeStatus(
    session: TrainingSession,
    status: TrainingSessionStatusEnum
  ): void {
    const previous = session.status;
    this.dataSource.patchStatus(session.id!, status);
    this.sessionsService.updateSession(session.id!, { status }).subscribe({
      next: () =>
        this.snackBar.open('Estado actualizado', '', { duration: 2500 }),
      error: () => {
        this.dataSource.patchStatus(session.id!, previous);
        this.snackBar.open('Error al actualizar el estado', 'Cerrar', {
          duration: 4000,
        });
      },
    });
  }

  getCategoryLabel(session: TrainingSession): string {
    return getCategoryLabel(session.category);
  }

  getStatusLabel(status: TrainingSessionStatusEnum): string {
    return getSessionStatusLabel(status);
  }

  getAttendanceCount(session: TrainingSession): string {
    const players = session.attendance?.filter((a) => !a.isStaff && !!a.status) ?? [];
    const present = players.filter((a) => a.status === 'present').length;
    const confirmed = session.attendance?.filter((a) => !a.isStaff && a.confirmed).length ?? 0;
    if (present > 0) return `${present}/${players.length} presentes`;
    if (confirmed > 0) return `${confirmed} confirmados`;
    return '—';
  }
}
