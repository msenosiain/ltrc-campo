import { Routes } from '@angular/router';
import { UsersListComponent } from './components/users-list/users-list.component';
import { UserViewerComponent } from './components/user-viewer/user-viewer.component';
import { UserEditorComponent } from './components/user-editor/user-editor.component';
import { hasRoleGuard } from '../auth/guards/has-role.guard';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

export const USERS_ROUTES: Routes = [
  {
    path: '',
    component: UsersListComponent,
    canActivate: [hasRoleGuard],
    title: 'Usuarios',
    data: { allowedRoles: [RoleEnum.ADMIN] },
  },
  {
    path: 'create',
    component: UserEditorComponent,
    canActivate: [hasRoleGuard],
    title: 'Crear usuario',
    data: { allowedRoles: [RoleEnum.ADMIN] },
  },
  {
    path: ':id',
    component: UserViewerComponent,
    canActivate: [hasRoleGuard],
    title: 'Detalle del usuario',
    data: { allowedRoles: [RoleEnum.ADMIN] },
  },
  {
    path: ':id/edit',
    component: UserEditorComponent,
    canActivate: [hasRoleGuard],
    title: 'Editar usuario',
    data: { allowedRoles: [RoleEnum.ADMIN] },
  },
];
