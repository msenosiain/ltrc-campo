import { Document, Types } from 'mongoose';
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

export class PlayerEntity extends Document {
  id: string;
  idNumber: string;
  name: string;
  memberNumber?: string;
  nickName: string;
  birthDate: Date;
  email: string;
  address?: {
    street?: string;
    number?: string;
    floorApartment?: string;
    neighborhood?: string;
    city?: string;
    postalCode?: string;
    phoneNumber: string;
  };
  sport?: SportEnum;
  category?: CategoryEnum;
  branch?: HockeyBranchEnum;
  positions?: PlayerPosition[];
  clothingSizes?: {
    jersey?: ClothingSizesEnum;
    shorts?: ClothingSizesEnum;
    sweater?: ClothingSizesEnum;
    pants?: ClothingSizesEnum;
  };
  medicalData?: {
    height?: number;
    weight?: number;
    torgIndex?: number;
    healthInsurance?: string;
    bloodType?: BloodTypeEnum;
  };
  parentContacts?: {
    name: string;
    email?: string;
    phone?: string;
  }[];
  status?: PlayerStatusEnum;
  trialStartDate?: Date;
  availability?: {
    status: PlayerAvailabilityEnum;
    reason?: string;
    since?: Date;
    estimatedReturn?: Date;
  };
  photoId?: string;
  userId?: Types.ObjectId;
  inactivatedAt?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
