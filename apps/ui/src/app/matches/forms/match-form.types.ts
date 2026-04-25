import {
  CategoryEnum,
  HockeyBranchEnum,
  MatchStatusEnum,
  SportEnum,
} from '@ltrc-campo/shared-api-model';


export interface MatchDayStaffFormValue {
  referee: string;
  ar1: string;
  ar2: string;
  headCoach: string;
}

export interface MatchFormValue {
  date: Date | null;
  opponent: string;
  opponents: string[];
  venue: string;
  isHome: boolean;
  status: MatchStatusEnum;
  sport: SportEnum | null;
  category: CategoryEnum | null;
  categories: CategoryEnum[];
  name: string;
  division: string;
  branch: HockeyBranchEnum | null;
  tournament: string | null;
  result: {
    homeScore: number | null;
    awayScore: number | null;
  };
  notes: string;
  matchDay: MatchDayStaffFormValue;
  payment: {
    enabled: boolean;
    concept: string;
    amount: number | null;
    expiresAt: Date | null;
    expiresAtTime: string;
  };
}

export interface MatchFilters {
  status?: MatchStatusEnum;
  sport?: SportEnum;
  category?: CategoryEnum;
  division?: string;
  tournament?: string;
  opponent?: string;
  fromDate?: string;
  toDate?: string;
  playerId?: string;
}
