import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  ViewChild,
} from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AsyncPipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ExerciseCategoryEnum, RoleEnum, SortOrder } from '@ltrc-campo/shared-api-model';
import { ExercisesService } from '../../services/exercises.service';
import { ExercisesDataSource } from '../../services/exercises.datasource';
import { getExerciseCategoryLabel, exerciseCategoryOptions } from '../../physical-training-options';
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../common/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'ltrc-exercise-list',
  standalone: true,
  imports: [
    MatTableModule,
    MatProgressBarModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    AsyncPipe,
    FormsModule,
    AllowedRolesDirective,
  ],
  templateUrl: './exercise-list.component.html',
  styleUrl: './exercise-list.component.scss',
})
export class ExerciseListComponent implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly exercisesService = inject(ExercisesService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly RoleEnum = RoleEnum;
  readonly categoryOptions = exerciseCategoryOptions;
  readonly displayedColumns = ['name', 'muscleGroups', 'actions'];
  readonly dataSource = new ExercisesDataSource(this.exercisesService);

  readonly muscleGroupOptions = [
    'abdominales', 'bíceps', 'core', 'cuádriceps', 'dorsales',
    'femoral', 'glúteos', 'hombros', 'lumbares', 'pecho', 'trapecios', 'tríceps',
  ];

  searchTerm = '';
  selectedCategory = '';
  selectedMuscleGroup = '';

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  ngAfterViewInit(): void {
    this.dataSource.configure(0, 25, 'name', SortOrder.ASC);
    this.dataSource.load();
    this.cdr.detectChanges();

    this.sort.sortChange.subscribe(() => {
      this.paginator.pageIndex = 0;
      this.dataSource.setSorting(this.sort.active, this.sort.direction as SortOrder);
    });

    this.paginator.page.subscribe(() => {
      this.dataSource.setPage(this.paginator.pageIndex, this.paginator.pageSize);
    });
  }

  applyFilters(): void {
    const filters: Record<string, unknown> = {};
    if (this.searchTerm) filters['searchTerm'] = this.searchTerm;
    if (this.selectedCategory) filters['category'] = this.selectedCategory;
    if (this.selectedMuscleGroup) filters['muscleGroup'] = this.selectedMuscleGroup;
    if (this.paginator) this.paginator.pageIndex = 0;
    this.dataSource.setFilters(filters);
  }

  getCategoryLabel(cat: ExerciseCategoryEnum): string {
    return getExerciseCategoryLabel(cat);
  }

  viewDetails(id: string): void {
    this.router.navigate(['/dashboard/physical/exercises', id]);
  }

  goBack(): void {
    this.router.navigate(['/dashboard/physical/workouts']);
  }

  createExercise(): void {
    this.router.navigate(['/dashboard/physical/exercises/new']);
  }

  editExercise(event: Event, id: string): void {
    event.stopPropagation();
    this.router.navigate(['/dashboard/physical/exercises', id, 'edit']);
  }

  deleteExercise(event: Event, id: string): void {
    event.stopPropagation();
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      data: {
        title: 'Eliminar ejercicio',
        message: '¿Estás seguro que querés eliminar este ejercicio?',
        confirmLabel: 'Eliminar',
      },
    });

    ref.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((confirmed) => {
      if (!confirmed) return;
      this.exercisesService.deleteExercise(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.snackBar.open('Ejercicio eliminado', 'Cerrar', { duration: 3000 });
          this.dataSource.load();
        },
        error: () => {
          this.snackBar.open('Error al eliminar el ejercicio', 'Cerrar', { duration: 5000 });
        },
      });
    });
  }
}
