import { Routes } from '@angular/router';
import { TournamentsListComponent } from './components/tournaments-list/tournaments-list.component';
import { TournamentViewerComponent } from './components/tournament-viewer/tournament-viewer.component';
import { TournamentEditorComponent } from './components/tournament-editor/tournament-editor.component';
import { hasRoleGuard } from '../auth/guards/has-role.guard';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

export const TOURNAMENTS_ROUTES: Routes = [
  {
    path: '',
    component: TournamentsListComponent,
    title: 'Torneos',
  },
  {
    path: 'create',
    component: TournamentEditorComponent,
    canActivate: [hasRoleGuard],
    title: 'Crear torneo',
    data: { allowedRoles: [RoleEnum.MANAGER, RoleEnum.ADMIN] },
  },
  {
    path: ':id',
    component: TournamentViewerComponent,
    title: 'Detalle del torneo',
  },
  {
    path: ':id/edit',
    component: TournamentEditorComponent,
    canActivate: [hasRoleGuard],
    title: 'Editar torneo',
    data: { allowedRoles: [RoleEnum.MANAGER, RoleEnum.ADMIN] },
  },
];
