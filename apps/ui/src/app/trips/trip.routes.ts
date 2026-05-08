import { Routes } from '@angular/router';
import { TripListComponent } from './components/trip-list/trip-list.component';
import { TripViewerComponent } from './components/trip-viewer/trip-viewer.component';
import { TripEditorComponent } from './components/trip-editor/trip-editor.component';
import { hasRoleGuard } from '../auth/guards/has-role.guard';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

export const TRIPS_ROUTES: Routes = [
  {
    path: '',
    component: TripListComponent,
    canActivate: [hasRoleGuard],
    data: { title: 'Viajes - Los Tordos', allowedRoles: [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COORDINATOR, RoleEnum.COACH] },
  },
  {
    path: 'create',
    component: TripEditorComponent,
    canActivate: [hasRoleGuard],
    data: { title: 'Nuevo viaje', allowedRoles: [RoleEnum.MANAGER, RoleEnum.ADMIN] },
  },
  {
    path: ':id',
    component: TripViewerComponent,
    canActivate: [hasRoleGuard],
    data: { title: 'Detalle del viaje', allowedRoles: [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COORDINATOR, RoleEnum.COACH] },
  },
  {
    path: ':id/edit',
    component: TripEditorComponent,
    canActivate: [hasRoleGuard],
    data: { title: 'Editar viaje', allowedRoles: [RoleEnum.MANAGER, RoleEnum.ADMIN] },
  },
];
