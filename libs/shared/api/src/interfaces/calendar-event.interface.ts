import { CategoryEnum } from '../enums/category.enum';
import { HockeyBranchEnum } from '../enums/hockey-branch.enum';
import { SportEnum } from '../enums/sport.enum';

export interface CalendarEvent {
  type: 'match' | 'training' | 'trip';
  id: string;
  date: string; // YYYY-MM-DDT12:00:00 (synthetic noon) for matches/trainings; full ISO datetime (UTC) for trips
  startTime?: string; // HH:mm — matches/trainings only, when a time was set
  title: string;
  sport?: SportEnum;
  category?: CategoryEnum;
  branch?: HockeyBranchEnum;
  division?: string;
  status: string;
  opponent?: string;
  isHome?: boolean;
  location?: string;
  userConfirmed?: boolean;
  destination?: string;   // trips only
  returnDate?: string;    // trips only
  costPerPerson?: number; // trips only
}
