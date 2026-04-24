import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
  inject,
  OnInit,
  DestroyRef,
  computed,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { AsyncPipe } from '@angular/common';
import { Observable, startWith, map } from 'rxjs';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  ClothingSizesEnum,
  HockeyBranchEnum,
  Player,
  PlayerAvailabilityEnum,
  PlayerPosition,
  PlayerStatusEnum,
  RoleEnum,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  getCategoryOptionsBySport,
  CategoryOption,
} from '../../../common/category-options';
import { sportOptions } from '../../../common/sport-options';
import {
  getPositionOptionsBySport,
  PositionOption,
} from '../../position-options';
import { buildCreatePlayerForm, buildParentContactGroup } from '../../forms/player-form.factory';
import { PlayerFormValue } from '../../forms/player-form.types';
import { mapPlayerToForm } from '../../forms/player-form.mapper';
import { PlayersService } from '../../services/players.service';
import { PlayerPhotoFieldComponent } from '../player-photo-field/player-photo-field.component';
import { AuthService } from '../../../auth/auth.service';
import {
  playerStatusOptions,
  playerAvailabilityOptions,
} from '../../player-status-options';

export interface PlayerFormSubmitEvent {
  payload: PlayerFormValue;
  file?: File;
  deletePhoto?: boolean;
}

@Component({
  standalone: true,
  selector: 'ltrc-player-form',
  imports: [
    ReactiveFormsModule,
    AsyncPipe,
    MatAutocompleteModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatCardModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatCheckboxModule,
    PlayerPhotoFieldComponent,
  ],
  styleUrls: ['./player-form.component.scss'],
  templateUrl: './player-form.component.html',
})
export class PlayerFormComponent implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly playersService = inject(PlayersService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);

  private readonly currentUser = toSignal(this.authService.user$);
  readonly isAdmin = computed(
    () => this.currentUser()?.roles?.includes(RoleEnum.ADMIN) ?? false
  );
  readonly isManager = computed(
    () => this.currentUser()?.roles?.includes(RoleEnum.MANAGER) ?? false
  );
  private readonly managerSports = computed(() => this.currentUser()?.sports ?? []);
  private readonly managerCategories = computed(() => this.currentUser()?.categories ?? []);

  private readonly playersAge = signal<number | null>(null);
  readonly isMinor = computed(() => {
    const age = this.playersAge();
    return age !== null && age < 18;
  });

  private readonly selectedPositions = signal<Set<string>>(new Set());

  @Input() player?: Player;
  @Input() submitting = false;

  @Output() readonly formSubmitWithPhoto =
    new EventEmitter<PlayerFormSubmitEvent>();
  @Output() readonly cancel = new EventEmitter<void>();

  availableSportOptions = sportOptions;
  readonly branchOptions = Object.values(HockeyBranchEnum);
  readonly clothingSizesOptions = Object.values(ClothingSizesEnum);

  readonly PlayerStatusEnum = PlayerStatusEnum;
  readonly statusOptions = computed(() =>
    this.isAdmin()
      ? playerStatusOptions
      : playerStatusOptions.filter((o) => o.id === PlayerStatusEnum.TRIAL)
  );
  readonly availabilityOptions = playerAvailabilityOptions;

  positions: PositionOption[] = getPositionOptionsBySport(null);
  categories: CategoryOption[] = getCategoryOptionsBySport(null);

  get showAvailabilityDetails(): boolean {
    return (
      this.playerForm.get('availabilityStatus')?.value !==
      PlayerAvailabilityEnum.AVAILABLE
    );
  }

  get isHockey(): boolean {
    return this.playerForm.get('sport')?.value === SportEnum.HOCKEY;
  }

  playerForm: FormGroup = buildCreatePlayerForm(this.fb);

  get positionsArray(): FormArray<FormControl<PlayerPosition | null>> {
    return this.playerForm.get('positions') as FormArray<FormControl<PlayerPosition | null>>;
  }

  addPosition(): void {
    this.positionsArray.push(this.fb.control<PlayerPosition | null>(null));
  }

  removePosition(index: number): void {
    this.positionsArray.removeAt(index);
    this.syncSelectedPositions();
  }

  getAvailablePositions(currentIndex: number): PositionOption[] {
    const selected = new Set<string>();
    this.positionsArray.controls.forEach((ctrl, i) => {
      if (i !== currentIndex && ctrl.value) selected.add(ctrl.value);
    });
    return this.positions.filter((p) => !selected.has(p.id));
  }

  private syncSelectedPositions(): void {
    const set = new Set<string>();
    this.positionsArray.controls.forEach((ctrl) => {
      if (ctrl.value) set.add(ctrl.value);
    });
    this.selectedPositions.set(set);
  }

  get parentContactsArray(): FormArray<FormGroup> {
    return this.playerForm.get('parentContacts') as FormArray<FormGroup>;
  }

  addParentContact(): void {
    const group = buildParentContactGroup(this.fb);
    if (this.isMinor() && this.parentContactsArray.length === 0) {
      this.setParentContactRequired(group);
      group.patchValue({
        phone: this.playerForm.get('address.phoneNumber')?.value || '',
        email: this.playerForm.get('email')?.value || '',
      });
    }
    this.parentContactsArray.push(group);
  }

  removeParentContact(index: number): void {
    this.parentContactsArray.removeAt(index);
    if (this.isMinor() && this.parentContactsArray.length > 0) {
      this.setParentContactRequired(this.parentContactsArray.at(0));
    }
  }

  private setParentContactRequired(group: FormGroup): void {
    for (const field of ['name', 'phone']) {
      const ctrl = group.get(field)!;
      ctrl.setValidators(Validators.required);
      ctrl.updateValueAndValidity();
    }
  }

  private clearParentContactRequired(group: FormGroup): void {
    for (const field of ['name', 'phone']) {
      const ctrl = group.get(field)!;
      ctrl.clearValidators();
      ctrl.updateValueAndValidity();
    }
  }

  private allHealthInsurances: string[] = [];
  filteredHealthInsurances$!: Observable<string[]>;

  ngOnInit(): void {
    // Non-admin editando: deshabilitar campo status (no puede cambiar a ACTIVE/INACTIVE)
    if (!this.isAdmin() && this.player) {
      this.playerForm.get('status')?.disable();
    }

    // Non-admin creando: forzar TRIAL
    if (!this.isAdmin() && !this.player) {
      this.playerForm.get('status')?.setValue(PlayerStatusEnum.TRIAL);
    }

    // Non-admin: pre-fill and lock sport/category based on user assignments
    if (!this.isAdmin() && !this.player) {
      const sports = this.managerSports();
      const allowedCategories = new Set(this.managerCategories());

      if (sports.length > 0) {
        this.availableSportOptions = sportOptions.filter((s) =>
          sports.includes(s.id as SportEnum)
        );
      }
      if (sports.length === 1) {
        this.playerForm.get('sport')?.setValue(sports[0]);
        this.playerForm.get('sport')?.disable();
      }
      // Apply initial category filter
      if (allowedCategories.size > 0) {
        const sport = sports.length === 1 ? sports[0] : null;
        this.categories = getCategoryOptionsBySport(sport).filter((c) =>
          allowedCategories.has(c.id)
        );
        if (this.categories.length === 1) {
          this.playerForm.get('category')?.setValue(this.categories[0].id);
          this.playerForm.get('category')?.disable();
        }
      }
    }

    this.playerForm
      .get('birthDate')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((birthDate: Date | null) => {
        if (birthDate) {
          this.playersAge.set(
            this.playersService.calculatePlayerAge(birthDate)
          );
        } else {
          this.playersAge.set(null);
        }
        this.updateParentContactsValidation();
      });

    this.filteredHealthInsurances$ = this.playerForm
      .get('medicalData.healthInsurance')!
      .valueChanges.pipe(
        startWith(''),
        map((v) => {
          const lc = (v ?? '').toLowerCase();
          return this.allHealthInsurances.filter((o) =>
            o.toLowerCase().includes(lc)
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      );

    this.playersService
      .getFieldOptions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ healthInsurances }) => {
        this.allHealthInsurances = healthInsurances;
      });
    this.playerForm
      .get('status')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => {
        if (status !== PlayerStatusEnum.TRIAL) {
          this.playerForm.get('trialStartDate')!.setValue(null, { emitEvent: false });
        }
      });

    this.playerForm
      .get('sport')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sport: SportEnum | null) => {
        this.positions = getPositionOptionsBySport(sport);
        let cats = getCategoryOptionsBySport(sport);
        if (!this.isAdmin()) {
          const allowed = new Set(this.managerCategories());
          if (allowed.size > 0) cats = cats.filter((c) => allowed.has(c.id));
        }
        this.categories = cats;
        if (!this.isAdmin() && cats.length === 1 && !this.player) {
          this.playerForm.get('category')?.setValue(cats[0].id);
          this.playerForm.get('category')?.disable();
        } else if (!this.player) {
          this.playerForm.get('category')?.enable();
        }
        // Clear positions if they no longer match the new sport
        const validIds = new Set(this.positions.map((p) => p.id));
        this.positionsArray.controls.forEach((ctrl) => {
          if (ctrl.value && !validIds.has(ctrl.value)) {
            ctrl.setValue(null);
          }
        });
        const cat = this.playerForm.get('category')?.value;
        if (cat && !this.categories.find((c) => c.id === cat)) {
          this.playerForm.get('category')?.setValue(null);
        }
        // Branch: required for hockey, cleared otherwise
        const branchCtrl = this.playerForm.get('branch')!;
        if (sport === SportEnum.HOCKEY) {
          branchCtrl.setValidators(Validators.required);
        } else {
          branchCtrl.clearValidators();
          branchCtrl.setValue(null);
        }
        branchCtrl.updateValueAndValidity();
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['player'] && this.player) {
      const mapped = mapPlayerToForm(this.player);
      this.playerForm.patchValue(mapped);

      // Populate positions FormArray
      this.positionsArray.clear();
      (this.player.positions ?? []).forEach((pos) => {
        this.positionsArray.push(this.fb.control<PlayerPosition | null>(pos));
      });

      // Populate parentContacts FormArray
      this.parentContactsArray.clear();
      (this.player.parentContacts ?? []).forEach((pc) => {
        const group = buildParentContactGroup(this.fb);
        group.patchValue({
          name: pc.name ?? '',
          email: pc.email ?? '',
          phone: pc.phone ?? '',
        });
        this.parentContactsArray.push(group);
      });

      // Trigger sport-based option filtering for loaded player
      const sport = this.player.sport ?? null;
      this.positions = getPositionOptionsBySport(sport);
      this.categories = getCategoryOptionsBySport(sport);

      // Trigger age calculation for loaded player
      if (this.player.birthDate) {
        this.playersAge.set(
          this.playersService.calculatePlayerAge(this.player.birthDate)
        );
      }

      if (this.player.photoId && this.player.id) {
        this.playerForm.get('photo')?.setValue({
          previewUrl: this.playersService.getPlayerPhotoUrl(this.player.id),
        });
      }
    }
  }

  private updateParentContactsValidation(): void {
    if (this.isMinor()) {
      if (this.parentContactsArray.length === 0) {
        this.addParentContact();
      }
      this.setParentContactRequired(this.parentContactsArray.at(0));
    } else {
      this.parentContactsArray.controls.forEach((group) =>
        this.clearParentContactRequired(group)
      );
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onSubmit(): void {
    if (this.playerForm.invalid) {
      this.playerForm.markAllAsTouched();
      return;
    }
    const photoValue = this.playerForm.get('photo')?.value;
    const hadPhoto = !!this.player?.photoId;
    const deletePhoto = hadPhoto && photoValue === null;
    this.formSubmitWithPhoto.emit({
      payload: this.playerForm.getRawValue() as PlayerFormValue,
      file: photoValue?.file,
      deletePhoto,
    });
  }
}
