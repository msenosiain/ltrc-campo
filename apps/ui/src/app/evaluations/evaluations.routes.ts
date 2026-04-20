import { Routes } from '@angular/router';
import { hasRoleGuard } from '../auth/guards/has-role.guard';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

export const EVALUATIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/evaluations-list/evaluations-list.component').then(
        (m) => m.EvaluationsListComponent
      ),
    data: { title: 'Evaluaciones' },
  },
  {
    path: 'player/:playerId',
    loadComponent: () =>
      import('./components/player-evaluation-history/player-evaluation-history.component').then(
        (m) => m.PlayerEvaluationHistoryComponent
      ),
    data: { title: 'Historial de evaluaciones' },
  },
];
