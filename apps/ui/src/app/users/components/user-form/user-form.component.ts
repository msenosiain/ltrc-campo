import {
  Component,
  DestroyRef,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { HockeyBranchEnum, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { roleOptions } from '../../user-options';
import { buildUserForm } from '../../forms/user-form.factory';
import { mapUserToForm } from '../../forms/user-form.mapper';
import { UserFormValue } from '../../forms/user-form.types';
import { User } from '../../User.interface';
import { sportOptions } from '../../../common/sport-options';
import {
  CategoryOption,
  categoryOptions,
  getCategoryOptionsBySports,
} from '../../../common/category-options';

@Component({
  selector: 'ltrc-user-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatCardModule,
  ],
  templateUrl: './user-form.component.html',
  styleUrl: './user-form.component.scss',
})
export class UserFormComponent implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  @Input() user?: User;
  @Input() submitting = false;
  @Output() readonly formSubmit = new EventEmitter<UserFormValue>();
  @Output() readonly cancel = new EventEmitter<void>();
  @Output() readonly deleteRequested = new EventEmitter<void>();

  private static readonly NON_SPORT_ROLES: RoleEnum[] = [RoleEnum.PLAYER];

  readonly roleOptions = roleOptions;
  readonly sportOptions = sportOptions;
  readonly branchOptions = Object.values(HockeyBranchEnum);
  filteredCategoryOptions: CategoryOption[] = categoryOptions;
  readonly RoleEnum = RoleEnum;

  get isCreate(): boolean {
    return !this.user;
  }

  get hasSportRole(): boolean {
    const roles: RoleEnum[] = this.form.get('roles')?.value ?? [];
    return roles.some((r) => !UserFormComponent.NON_SPORT_ROLES.includes(r));
  }

  get hasHockey(): boolean {
    return this.form.get('sports')?.value?.includes(SportEnum.HOCKEY) ?? false;
  }

  form = buildUserForm(this.fb, true);

  ngOnInit(): void {
    this.form = buildUserForm(this.fb, this.isCreate);
    if (this.user) {
      this.form.patchValue(mapUserToForm(this.user));
      this.filteredCategoryOptions = getCategoryOptionsBySports(
        this.user.sports ?? []
      );
    }

    this.form
      .get('roles')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((roles: RoleEnum[]) => {
        const hasSportRole = roles.some((r) => !UserFormComponent.NON_SPORT_ROLES.includes(r));
        if (!hasSportRole) {
          this.form.patchValue({ sports: [], categories: [], branches: [] });
        }
      });

    this.form
      .get('sports')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sports: SportEnum[]) => {
        this.filteredCategoryOptions = getCategoryOptionsBySports(sports);
        const currentCategories = this.form.get('categories')!.value;
        const validIds = new Set(this.filteredCategoryOptions.map((c) => c.id));
        const filtered = currentCategories.filter((c) => validIds.has(c));
        if (filtered.length !== currentCategories.length) {
          this.form.get('categories')!.setValue(filtered, { emitEvent: false });
        }
        if (!sports.includes(SportEnum.HOCKEY)) {
          this.form.get('branches')!.setValue([], { emitEvent: false });
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['user'] && this.user) {
      this.form.patchValue(mapUserToForm(this.user));
    }
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.formSubmit.emit(this.form.getRawValue() as UserFormValue);
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onDelete(): void {
    this.deleteRequested.emit();
  }
}
