import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import {
  BloodTypeEnum,
  CategoryEnum,
  ClothingSizesEnum,
  HockeyBranchEnum,
  PlayerAvailabilityEnum,
  PlayerPosition,
  PlayerStatusEnum,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import { PhotoValue } from '../components/player-photo-field/player-photo-field.component';

export function buildParentContactGroup(fb: FormBuilder): FormGroup {
  return fb.group({
    name: fb.nonNullable.control(''),
    email: fb.nonNullable.control(''),
    phone: fb.nonNullable.control(''),
  });
}

export function buildCreatePlayerForm(fb: FormBuilder) {
  return fb.group({
    photo: fb.control<PhotoValue | null>(null),
    createUser: fb.nonNullable.control(false),
    name: fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/),
    ]),
    nickName: fb.nonNullable.control(''),
    memberNumber: fb.nonNullable.control(''),
    idNumber: fb.nonNullable.control('', [
      Validators.required,
      Validators.minLength(7),
      Validators.maxLength(8),
      Validators.pattern(/^\d{7,8}$/),
    ]),
    birthDate: fb.control<Date | null>(null, Validators.required),
    email: fb.nonNullable.control('', [Validators.email]),

    sport: fb.control<SportEnum | null>(null, Validators.required),
    category: fb.control<CategoryEnum | null>(null, Validators.required),
    branch: fb.control<HockeyBranchEnum | null>(null),
    positions: fb.array<FormControl<PlayerPosition | null>>([]),

    address: fb.group({
      street: fb.nonNullable.control(''),
      number: fb.nonNullable.control(''),
      floorApartment: fb.nonNullable.control(''),
      city: fb.nonNullable.control(''),
      postalCode: fb.nonNullable.control(''),
      neighborhood: fb.nonNullable.control(''),
      phoneNumber: fb.nonNullable.control('', [
        Validators.required,
        Validators.pattern(/^[\d\s\+\-\(\)]{6,20}$/),
      ]),
    }),

    clothingSizes: fb.group({
      jersey: fb.control<ClothingSizesEnum | null>(null),
      shorts: fb.control<ClothingSizesEnum | null>(null),
      sweater: fb.control<ClothingSizesEnum | null>(null),
      pants: fb.control<ClothingSizesEnum | null>(null),
    }),

    medicalData: fb.group({
      height: fb.control<number | null>(null),
      weight: fb.control<number | null>(null),
      torgIndex: fb.control<number | null>(null),
      healthInsurance: fb.nonNullable.control(''),
      bloodType: fb.control<BloodTypeEnum | null>(null),
    }),

    status: fb.nonNullable.control<PlayerStatusEnum>(PlayerStatusEnum.ACTIVE),
    trialStartDate: fb.control<Date | null>(null),
    availabilityStatus: fb.nonNullable.control<PlayerAvailabilityEnum>(
      PlayerAvailabilityEnum.AVAILABLE
    ),
    availabilityReason: fb.nonNullable.control(''),
    availabilitySince: fb.control<Date | null>(null),
    availabilityEstimatedReturn: fb.control<Date | null>(null),

    parentContacts: fb.array<FormGroup>([]),
  });
}
