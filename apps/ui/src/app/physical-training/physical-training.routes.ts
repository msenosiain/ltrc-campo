import { Routes } from '@angular/router';
import { hasRoleGuard } from '../auth/guards/has-role.guard';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

export const PHYSICAL_TRAINING_ROUTES: Routes = [
  { path: '', redirectTo: 'workouts', pathMatch: 'full' },
  {
    path: 'my-workout',
    loadComponent: () =>
      import('./components/my-workout/my-workout.component').then(
        (m) => m.MyWorkoutComponent
      ),
    title: 'Mi entrenamiento de hoy',
  },
  {
    path: 'exercises',
    loadComponent: () =>
      import('./components/exercise-list/exercise-list.component').then(
        (m) => m.ExerciseListComponent
      ),
    title: 'Ejercicios',
  },
  {
    path: 'exercises/new',
    loadComponent: () =>
      import('./components/exercise-form/exercise-form.component').then(
        (m) => m.ExerciseFormComponent
      ),
    canActivate: [hasRoleGuard],
    title: 'Nuevo ejercicio',
    data: { allowedRoles: [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.TRAINER] },
  },
  {
    path: 'exercises/:id/edit',
    loadComponent: () =>
      import('./components/exercise-form/exercise-form.component').then(
        (m) => m.ExerciseFormComponent
      ),
    canActivate: [hasRoleGuard],
    title: 'Editar ejercicio',
    data: { allowedRoles: [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.TRAINER] },
  },
  {
    path: 'exercises/:id',
    loadComponent: () =>
      import('./components/exercise-viewer/exercise-viewer.component').then(
        (m) => m.ExerciseViewerComponent
      ),
    title: 'Detalle de ejercicio',
  },
  {
    path: 'workouts',
    loadComponent: () =>
      import('./components/workout-list/workout-list.component').then(
        (m) => m.WorkoutListComponent
      ),
    title: 'Rutinas',
  },
  {
    path: 'workouts/new',
    loadComponent: () =>
      import('./components/workout-form/workout-form.component').then(
        (m) => m.WorkoutFormComponent
      ),
    canActivate: [hasRoleGuard],
    title: 'Nueva rutina',
    data: { allowedRoles: [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.TRAINER] },
  },
  {
    path: 'workouts/:id/blocks',
    loadComponent: () =>
      import('./components/workout-blocks-editor/workout-blocks-editor.component').then(
        (m) => m.WorkoutBlocksEditorComponent
      ),
    canActivate: [hasRoleGuard],
    title: 'Editar bloques de rutina',
    data: { allowedRoles: [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.TRAINER] },
  },
  {
    path: 'workouts/:id/edit',
    loadComponent: () =>
      import('./components/workout-form/workout-form.component').then(
        (m) => m.WorkoutFormComponent
      ),
    canActivate: [hasRoleGuard],
    title: 'Editar rutina',
    data: { allowedRoles: [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.TRAINER] },
  },
  {
    path: 'workouts/:id',
    loadComponent: () =>
      import('./components/workout-viewer/workout-viewer.component').then(
        (m) => m.WorkoutViewerComponent
      ),
    title: 'Detalle de rutina',
  },
  {
    path: 'workout-logs',
    loadComponent: () =>
      import('./components/workout-log-list/workout-log-list.component').then(
        (m) => m.WorkoutLogListComponent
      ),
    title: 'Registros de entrenamiento',
  },
];
