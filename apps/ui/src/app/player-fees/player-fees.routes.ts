import { Routes } from '@angular/router';

export const PLAYER_FEES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/player-fees-list/player-fees-list.component').then(
        (m) => m.PlayerFeesListComponent
      ),
  },
];
