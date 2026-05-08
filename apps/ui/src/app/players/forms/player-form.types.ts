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

export type PlayerFormValue = {
  photo?: PhotoValue | null;
  createUser?: boolean;

  name: string;
  memberNumber: string;
  nickName: string;
  idNumber: string;
  birthDate: Date | null;
  email: string;

  sport: SportEnum | null;
  category: CategoryEnum | null;
  branch: HockeyBranchEnum | null;
  positions: (PlayerPosition | null)[];

  address: {
    street: string;
    number: string;
    floorApartment: string;
    city: string;
    postalCode: string;
    neighborhood: string;
    phoneNumber: string;
  };

  clothingSizes: {
    jersey: ClothingSizesEnum | null;
    shorts: ClothingSizesEnum | null;
    sweater: ClothingSizesEnum | null;
    pants: ClothingSizesEnum | null;
  };

  medicalData: {
    height: number | null;
    weight: number | null;
    torgIndex: number | null;
    healthInsurance: string;
    bloodType: BloodTypeEnum | null;
  };

  status: PlayerStatusEnum;
  trialStartDate: Date | null;
  availabilityStatus: PlayerAvailabilityEnum;
  availabilityReason: string;
  availabilitySince: Date | null;
  availabilityEstimatedReturn: Date | null;

  parentContacts: ParentContactValue[];
};

export type ParentContactValue = {
  name: string;
  email: string;
  phone: string;
};
