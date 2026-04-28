import { CollectionViewer, DataSource } from '@angular/cdk/collections';
import {
  asyncScheduler,
  BehaviorSubject,
  finalize,
  Observable,
  observeOn,
} from 'rxjs';
import { Match, PaginationQuery, SortOrder } from '@ltrc-campo/shared-api-model';
import { MatchFilters } from '../forms/match-form.types';
import { MatchesService } from './matches.service';

export class MatchesDataSource implements DataSource<Match> {
  private matchesSubject = new BehaviorSubject<Match[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);

  loading$ = this.loadingSubject.asObservable().pipe(observeOn(asyncScheduler));
  total = 0;

  private filters: MatchFilters = {};
  private pageIndex = 0;
  private pageSize = 25;
  private sortBy?: string;
  private sortOrder?: SortOrder;

  constructor(private matchesService: MatchesService) {}

  connect(_: CollectionViewer): Observable<Match[]> {
    return this.matchesSubject.asObservable();
  }

  disconnect(): void {
    this.matchesSubject.complete();
    this.loadingSubject.complete();
  }

  /** Set page/sort state without loading — use before first setFilters call */
  configure(pageIndex: number, pageSize: number, sortBy?: string, sortOrder?: SortOrder): void {
    this.pageIndex = pageIndex;
    this.pageSize = pageSize;
    this.sortBy = sortBy;
    this.sortOrder = sortOrder;
  }

  setFilters(filters: MatchFilters, pageIndex = 0): void {
    this.filters = filters;
    this.pageIndex = pageIndex;
    this.load();
  }

  setSorting(sortBy: string, sortOrder: SortOrder): void {
    this.sortBy = sortBy;
    this.sortOrder = sortOrder;
    this.load();
  }

  setPage(pageIndex: number, pageSize: number): void {
    this.pageIndex = pageIndex;
    this.pageSize = pageSize;
    this.load();
  }

  updateItem(updated: Match): void {
    const items = this.matchesSubject.getValue();
    this.matchesSubject.next(items.map(m => (m.id === updated.id ? updated : m)));
  }

  refresh(): void {
    this.load();
  }

  private load(): void {
    this.loadingSubject.next(true);

    const query: PaginationQuery = {
      page: this.pageIndex + 1,
      size: this.pageSize,
      filters: this.filters,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
    };

    this.matchesService
      .getMatches(query)
      .pipe(finalize(() => this.loadingSubject.next(false)))
      .subscribe({
        next: (res) => {
          this.total = res.total;
          this.matchesSubject.next(res.items);
        },
        error: () => this.matchesSubject.next([]),
      });
  }
}
