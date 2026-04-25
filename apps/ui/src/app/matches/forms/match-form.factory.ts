import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  CategoryEnum,
  MatchStatusEnum,
  SportEnum,
} from '@ltrc-campo/shared-api-model';

export function buildCreateMatchForm(fb: FormBuilder): FormGroup {
  return fb.group({
    date: [null, Validators.required],
    name: [''],
    opponent: [''],
    venue: ['', Validators.required],
    isHome: [true],
    status: [MatchStatusEnum.UPCOMING],
    sport: [null as SportEnum | null, Validators.required],
    category: [null as CategoryEnum | null, Validators.required],
    categories: [[] as CategoryEnum[]],
    division: [''],
    branch: [null],
    tournament: ['' as string],
    result: fb.group({
      homeScore: [null],
      awayScore: [null],
    }),
    notes: [''],
    matchDay: fb.group({
      referee: [''],
      ar1: [''],
      ar2: [''],
      headCoach: [''],
    }),
    payment: fb.group({
      enabled: [false],
      concept: ['Tercer tiempo'],
      amount: [null as number | null],
      expiresAt: [null as Date | null],
      expiresAtTime: ['23:59'],
    }),
  });
}
