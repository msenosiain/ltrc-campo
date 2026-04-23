import { CategoryEnum, HockeyBranchEnum, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export interface User {
  id?: string;
  googleId?: string;
  sub?: string;
  email: string;
  name: string;
  idNumber?: string;
  memberNumber?: string;
  roles: RoleEnum[];
  hasPassword?: boolean;
  sports?: SportEnum[];
  categories?: CategoryEnum[];
  branches?: HockeyBranchEnum[];
}
