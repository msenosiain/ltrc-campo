import { AsyncPipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { CollectionViewer, DataSource } from '@angular/cdk/collections';
import { BehaviorSubject, finalize, Observable } from 'rxjs';
import { WorkoutLog } from '@ltrc-campo/shared-api-model';
import { WorkoutLogsService } from '../../services/workout-logs.service';

class WorkoutLogDataSource implements DataSource<WorkoutLog> {
  private readonly itemsSubject = new BehaviorSubject<WorkoutLog[]>([]);
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  readonly loading$ = this.loadingSubject.asObservable();
  total = 0;

  constructor(private readonly service: WorkoutLogsService) {}

  connect(_: CollectionViewer): Observable<WorkoutLog[]> {
    return this.itemsSubject.asObservable();
  }

  disconnect(): void {
    this.itemsSubject.complete();
    this.loadingSubject.complete();
  }

  load(page = 1, size = 25, filters: Record<string, unknown> = {}): void {
    this.loadingSubject.next(true);
    const params: any = { page, size, ...filters };
    this.service
      .getWorkoutLogs(params)
      .pipe(finalize(() => this.loadingSubject.next(false)))
      .subscribe({
        next: (res) => { this.total = res.total; this.itemsSubject.next(res.items); },
        error: () => this.itemsSubject.next([]),
      });
  }
}

@Component({
  selector: 'ltrc-workout-log-list',
  standalone: true,
  imports: [
    AsyncPipe,
    FormsModule,
    MatTableModule,
    MatProgressBarModule,
    MatPaginatorModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './workout-log-list.component.html',
  styleUrl: './workout-log-list.component.scss',
})
export class WorkoutLogListComponent implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly workoutLogsService = inject(WorkoutLogsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly displayedColumns = ['date', 'player', 'routine', 'status', 'actions'];
  readonly dataSource = new WorkoutLogDataSource(this.workoutLogsService);

  selectedStatus = '';
  dateFrom = '';
  dateTo = '';

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  ngAfterViewInit(): void {
    this.dataSource.load();
    this.cdr.detectChanges();
    this.paginator.page
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadPage());
  }

  private loadPage(): void {
    const filters: Record<string, unknown> = {};
    if (this.selectedStatus) filters['status'] = this.selectedStatus;
    if (this.dateFrom) filters['dateFrom'] = this.dateFrom;
    if (this.dateTo) filters['dateTo'] = this.dateTo;
    this.dataSource.load(this.paginator.pageIndex + 1, this.paginator.pageSize, filters);
  }

  applyFilters(): void {
    if (this.paginator) this.paginator.pageIndex = 0;
    this.loadPage();
  }

  getStatusLabel(status: string): string {
    return status === 'completed' ? 'Completado' : 'En progreso';
  }

  getPlayerName(log: WorkoutLog): string {
    const p = log.player;
    return typeof p === 'string' ? p : (p as any)?.name ?? '—';
  }

  getRoutineName(log: WorkoutLog): string {
    const r = log.routine;
    return typeof r === 'string' ? r : (r as any)?.name ?? '—';
  }

  viewLog(id: string | undefined): void {
    if (id) this.router.navigate(['/dashboard/physical/workout-logs', id]);
  }
}
