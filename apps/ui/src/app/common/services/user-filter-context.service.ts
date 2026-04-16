import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, map, shareReplay } from 'rxjs';
import {
  CategoryEnum,
  HockeyBranchEnum,
  RoleEnum,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import { AuthService } from '../../auth/auth.service';
import {
  CategoryOption,
  categoryOptions,
  getCategoryOptionsBySports,
} from '../category-options';
import { SportOption, sportOptions } from '../sport-options';
import { BranchOption, branchOptions } from '../branch-options';

export interface FilterContext {
  showSportFilter: boolean;
  sportOptions: SportOption[];
  forcedSport?: SportEnum;

  showCategoryFilter: boolean;
  categoryOptions: CategoryOption[];
  forcedCategory?: CategoryEnum;

  showBranchFilter: boolean;
  branchOptions: BranchOption[];
  forcedBranch?: HockeyBranchEnum;
}

const initialContext: FilterContext = {
  showSportFilter: true,
  sportOptions,
  showCategoryFilter: true,
  categoryOptions,
  showBranchFilter: true,
  branchOptions,
};

@Injectable({ providedIn: 'root' })
export class UserFilterContextService {
  private readonly authService = inject(AuthService);

  readonly filterContext$: Observable<FilterContext> =
    this.authService.user$.pipe(
      map((user) => {
        const isPlayer = user?.roles?.includes(RoleEnum.PLAYER) && !user?.roles?.some(r => [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COACH, RoleEnum.TRAINER, RoleEnum.ANALYST].includes(r));
        const userSports = user?.sports ?? [];
        const userCategories = user?.categories ?? [];
        const userBranches = user?.branches ?? [];

        const showSportFilter = !isPlayer && userSports.length !== 1;
        const forcedSport = userSports.length === 1 ? userSports[0] : undefined;
        const filteredSportOptions =
          userSports.length === 0
            ? sportOptions
            : sportOptions.filter((s) => userSports.includes(s.id));

        // Categories depend on the effective sports
        const allCategoryOptions =
          userSports.length === 0
            ? categoryOptions
            : getCategoryOptionsBySports(userSports);

        const showCategoryFilter = !isPlayer && userCategories.length !== 1;
        const forcedCategory =
          userCategories.length === 1 ? userCategories[0] : undefined;
        const filteredCategoryOptions =
          userCategories.length === 0
            ? allCategoryOptions
            : allCategoryOptions.filter((c) => userCategories.includes(c.id));

        // Branches
        const showBranchFilter = userBranches.length !== 1;
        const forcedBranch =
          userBranches.length === 1 ? userBranches[0] : undefined;
        const filteredBranchOptions =
          userBranches.length === 0
            ? branchOptions
            : branchOptions.filter((b) => userBranches.includes(b.id));

        return {
          showSportFilter,
          sportOptions: filteredSportOptions,
          forcedSport,
          showCategoryFilter,
          categoryOptions: filteredCategoryOptions,
          forcedCategory,
          showBranchFilter,
          branchOptions: filteredBranchOptions,
          forcedBranch,
        };
      }),
      shareReplay(1)
    );

  readonly filterContext = toSignal(this.filterContext$, { initialValue: initialContext });
}
