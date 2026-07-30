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
    title: 'Viajes',
    data: { allowedRoles: [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COORDINATOR, RoleEnum.COACH] },
  },
  {
    path: 'create',
    component: TripEditorComponent,
    canActivate: [hasRoleGuard],
    title: 'Nuevo viaje',
    data: { allowedRoles: [RoleEnum.ADMIN, RoleEnum.COORDINATOR] },
  },
  {
    path: ':id',
    component: TripViewerComponent,
    canActivate: [hasRoleGuard],
    title: 'Detalle del viaje',
    data: { allowedRoles: [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COORDINATOR, RoleEnum.COACH] },
  },
  {
    path: ':id/edit',
    component: TripEditorComponent,
    canActivate: [hasRoleGuard],
    title: 'Editar viaje',
    data: { allowedRoles: [RoleEnum.ADMIN, RoleEnum.COORDINATOR] },
  },
];
