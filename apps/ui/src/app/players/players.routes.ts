import { Routes } from '@angular/router';
import { PlayersListComponent } from './components/players-list/players-list.component';
import { PlayerViewerComponent } from './components/player-viewer/player-viewer.component';
import { PlayerEditorComponent } from './components/player-editor/player-editor.component';
import { MyProfileEditorComponent } from './components/my-profile-editor/my-profile-editor.component';
import { hasRoleGuard } from '../auth/guards/has-role.guard';
import { canEditPlayerGuard } from '../auth/guards/can-edit-player.guard';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

export const PLAYERS_ROUTES: Routes = [
  {
    path: '',
    component: PlayersListComponent,
    title: 'Plantel',
  },
  {
    path: 'me/edit',
    component: MyProfileEditorComponent,
    title: 'Editar mi perfil',
  },
  {
    path: 'create',
    component: PlayerEditorComponent,
    canActivate: [hasRoleGuard],
    title: 'Crear jugador',
    data: { allowedRoles: [RoleEnum.MANAGER, RoleEnum.ADMIN, RoleEnum.COACH, RoleEnum.COORDINATOR] },
  },
  {
    path: ':id',
    component: PlayerViewerComponent,
    title: 'Detalle del jugador',
  },
  {
    path: ':id/edit',
    component: PlayerEditorComponent,
    canActivate: [canEditPlayerGuard],
    title: 'Editar jugador',
  },
];
