import { FormBuilder, Validators } from '@angular/forms';
import { CategoryEnum, HockeyBranchEnum, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';

export function buildUserForm(fb: FormBuilder, isCreate = false) {
  return fb.group({
    name: fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(2),
    ]),
    memberNumber: fb.nonNullable.control(''),
    idNumber: fb.nonNullable.control(''),
    email: fb.nonNullable.control('', [Validators.required, Validators.email]),
    roles: fb.nonNullable.control<RoleEnum[]>([], Validators.required),
    password: fb.control<string | null>(null, isCreate ? [] : []),
    sports: fb.nonNullable.control<SportEnum[]>([]),
    categories: fb.nonNullable.control<CategoryEnum[]>([]),
    branches: fb.nonNullable.control<HockeyBranchEnum[]>([]),
  });
}
