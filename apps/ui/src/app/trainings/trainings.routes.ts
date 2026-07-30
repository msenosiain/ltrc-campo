import { Routes } from '@angular/router';
import { TrainingsLayoutComponent } from './components/trainings-layout/trainings-layout.component';
import { ScheduleListComponent } from './components/schedule-list/schedule-list.component';
import { ScheduleEditorComponent } from './components/schedule-editor/schedule-editor.component';
import { ScheduleViewerComponent } from './components/schedule-viewer/schedule-viewer.component';
import { SessionListComponent } from './components/session-list/session-list.component';
import { SessionViewerComponent } from './components/session-viewer/session-viewer.component';
import { AttendanceRollCallComponent } from './components/attendance-roll-call/attendance-roll-call.component';
import { hasRoleGuard } from '../auth/guards/has-role.guard';
import { RoleEnum } from '@ltrc-campo/shared-api-model';
import { SessionEvaluateComponent } from '../evaluations/components/session-evaluate/session-evaluate.component';
import { QrDisplayPageComponent } from './components/qr-display-page/qr-display-page.component';

export const TRAININGS_ROUTES: Routes = [
  {
    path: '',
    component: TrainingsLayoutComponent,
    children: [
      {
        path: '',
        redirectTo: 'sessions',
        pathMatch: 'full',
      },
      {
        path: 'sessions',
        component: SessionListComponent,
        title: 'Sesiones de entrenamiento',
      },
      {
        path: 'schedules',
        component: ScheduleListComponent,
        canActivate: [hasRoleGuard],
        title: 'Horarios de entrenamiento',
        data: {
          allowedRoles: [RoleEnum.ADMIN, RoleEnum.MANAGER],
        },
      },
      {
        path: 'schedules/create',
        component: ScheduleEditorComponent,
        canActivate: [hasRoleGuard],
        title: 'Crear horario',
        data: {
          allowedRoles: [RoleEnum.MANAGER, RoleEnum.ADMIN],
        },
      },
      {
        path: 'schedules/:id',
        component: ScheduleViewerComponent,
        title: 'Detalle del horario',
      },
      {
        path: 'schedules/:id/edit',
        component: ScheduleEditorComponent,
        canActivate: [hasRoleGuard],
        title: 'Editar horario',
        data: {
          allowedRoles: [RoleEnum.MANAGER, RoleEnum.ADMIN],
        },
      },
      {
        path: 'sessions/:id',
        component: SessionViewerComponent,
        title: 'Detalle de sesión',
      },
      {
        path: 'sessions/:id/qr',
        component: QrDisplayPageComponent,
        canActivate: [hasRoleGuard],
        title: 'QR Asistencia',
        data: {
          allowedRoles: [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COORDINATOR, RoleEnum.COACH, RoleEnum.TRAINER],
        },
      },
      {
        path: 'sessions/:id/attendance',
        component: AttendanceRollCallComponent,
        canActivate: [hasRoleGuard],
        title: 'Asistencia',
        data: {
          allowedRoles: [
            RoleEnum.ADMIN,
            RoleEnum.MANAGER,
            RoleEnum.COACH,
            RoleEnum.TRAINER,
          ],
        },
      },
      {
        path: 'sessions/:id/evaluate',
        component: SessionEvaluateComponent,
        canActivate: [hasRoleGuard],
        title: 'Evaluar jugadores',
        data: {
          allowedRoles: [
            RoleEnum.ADMIN,
            RoleEnum.MANAGER,
            RoleEnum.COORDINATOR,
            RoleEnum.COACH,
            RoleEnum.TRAINER,
          ],
        },
      },
    ],
  },
];
