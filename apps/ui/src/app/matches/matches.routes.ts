import { Routes } from '@angular/router';
import { MatchesListComponent } from './components/matches-list/matches-list.component';
import { MatchViewerComponent } from './components/match-viewer/match-viewer.component';
import { MatchEditorComponent } from './components/match-editor/match-editor.component';
import { SquadEditorComponent } from './components/squad-editor/squad-editor.component';
import { MatchAttendanceComponent } from './components/match-attendance/match-attendance.component';
import { hasRoleGuard } from '../auth/guards/has-role.guard';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

export const MATCHES_ROUTES: Routes = [
  {
    path: '',
    component: MatchesListComponent,
    title: 'Partidos',
  },
  {
    path: 'create',
    component: MatchEditorComponent,
    canActivate: [hasRoleGuard],
    title: 'Crear partido',
    data: {
      allowedRoles: [RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER],
    },
  },
  {
    path: ':id',
    component: MatchViewerComponent,
    title: 'Detalle del partido',
  },
  {
    path: ':id/edit',
    component: MatchEditorComponent,
    canActivate: [hasRoleGuard],
    title: 'Editar partido',
    data: {
      allowedRoles: [RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER],
    },
  },
  {
    path: ':id/squad',
    component: SquadEditorComponent,
    canActivate: [hasRoleGuard],
    title: 'Gestionar plantel',
    data: {
      allowedRoles: [RoleEnum.TRAINER, RoleEnum.COACH, RoleEnum.MANAGER, RoleEnum.ADMIN],
    },
  },
  {
    path: ':id/attendance',
    component: MatchAttendanceComponent,
    canActivate: [hasRoleGuard],
    title: 'Gestionar asistencia',
    data: {
      allowedRoles: [
        RoleEnum.ADMIN,
        RoleEnum.COORDINATOR,
        RoleEnum.MANAGER,
        RoleEnum.COACH,
        RoleEnum.TRAINER,
      ],
    },
  },
];
