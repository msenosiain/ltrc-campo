import { CategoryEnum, HockeyBranchEnum, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export type UserFormValue = {
  name: string;
  memberNumber: string;
  idNumber: string;
  email: string;
  roles: RoleEnum[];
  password?: string;
  sports?: SportEnum[];
  categories?: CategoryEnum[];
  branches?: HockeyBranchEnum[];
};

export type UserFilters = {
  searchTerm?: string;
  role?: RoleEnum;
  sport?: SportEnum;
  category?: CategoryEnum;
};
