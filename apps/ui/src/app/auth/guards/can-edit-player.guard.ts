import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, take, switchMap, map, catchError, of } from 'rxjs';
import { AuthService } from '../auth.service';
import { PlayersService } from '../../players/services/players.service';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

const ALLOWED_ROLES = [RoleEnum.MANAGER, RoleEnum.ADMIN, RoleEnum.COACH, RoleEnum.COORDINATOR];

export const canEditPlayerGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const playersService = inject(PlayersService);
  const router = inject(Router);

  const playerId = route.paramMap.get('id');

  return authService.user$.pipe(
    filter((user) => !!user),
    take(1),
    switchMap((user) => {
      const hasRole = ALLOWED_ROLES.some((role) => user!.roles.includes(role));
      if (!hasRole) {
        router.navigate(['/login']);
        return of(false);
      }

      if (user!.roles.includes(RoleEnum.ADMIN) || !playerId) {
        return of(true);
      }

      return playersService.getPlayerById(playerId).pipe(
        map((player) => {
          const userSports = user!.sports ?? [];
          const userCategories = user!.categories ?? [];

          const sportOk = !userSports.length || (!!player.sport && userSports.includes(player.sport));
          const categoryOk = !userCategories.length || (!!player.category && userCategories.includes(player.category));

          if (!sportOk || !categoryOk) {
            router.navigate(['/dashboard/players']);
            return false;
          }
          return true;
        }),
        catchError(() => {
          router.navigate(['/dashboard/players']);
          return of(false);
        })
      );
    })
  );
};
