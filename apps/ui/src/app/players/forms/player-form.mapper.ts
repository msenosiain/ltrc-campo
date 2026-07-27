import {
  BloodTypeEnum,
  Player,
  DATE_FORMAT,
  PlayerAvailabilityEnum,
  PlayerPosition,
  PlayerStatusEnum,
} from '@ltrc-campo/shared-api-model';
import { PlayerFormValue } from './player-form.types';
import { format } from 'date-fns';

// FORM -> CREATE DTO (NestJS)
export function mapFormToCreatePlayerDto(value: PlayerFormValue) {
  return {
    name: value.name,
    memberNumber: value.memberNumber || undefined,
    nickName: value.nickName || undefined,
    idNumber: value.idNumber,
    birthDate: format(value.birthDate!, DATE_FORMAT),
    email: value.email,
    sport: value.sport ?? undefined,
    category: value.category ?? undefined,
    branch: value.branch ?? undefined,
    positions: value.positions.filter((p): p is PlayerPosition => p !== null),
    address: mapAddress(value),
    clothingSizes: mapClothingSizes(value),
    medicalData: mapMedicalData(value),
    status: value.status,
    trialStartDate: value.trialStartDate ? value.trialStartDate.toISOString() : undefined,
    availability: mapAvailability(value),
    parentContacts: mapParentContacts(value),
    createUser: value.createUser ?? false,
  };
}

// PLAYER -> FORM (EDIT)
export function mapPlayerToForm(player: Player): PlayerFormValue {
  return {
    photo: null, // la foto existente se maneja via existingPhotoUrl, no como PhotoValue

    name: player.name,
    memberNumber: player.memberNumber ?? '',
    nickName: player.nickName ?? '',
    idNumber: player.idNumber,
    birthDate: utcToLocalDate(new Date(player.birthDate)),
    email: player.email,

    sport: player.sport ?? null,
    category: player.category ?? null,
    branch: player.branch ?? null,
    positions: player.positions ?? [],

    status: player.status ?? PlayerStatusEnum.ACTIVE,
    trialStartDate: player.trialStartDate ? new Date(player.trialStartDate) : null,
    availabilityStatus:
      player.availability?.status ?? PlayerAvailabilityEnum.AVAILABLE,
    availabilityReason: player.availability?.reason ?? '',
    availabilitySince: player.availability?.since ?? null,
    availabilityEstimatedReturn: player.availability?.estimatedReturn ?? null,

    address: {
      street: player.address?.street ?? '',
      number: player.address?.number ?? '',
      floorApartment: player.address?.floorApartment ?? '',
      city: player.address?.city ?? '',
      postalCode: player.address?.postalCode ?? '',
      neighborhood: player.address?.neighborhood ?? '',
      phoneNumber: player.address?.phoneNumber ?? '',
    },

    clothingSizes: {
      jersey: player.clothingSizes?.jersey ?? null,
      shorts: player.clothingSizes?.shorts ?? null,
      sweater: player.clothingSizes?.sweater ?? null,
      pants: player.clothingSizes?.pants ?? null,
    },

    medicalData: {
      height: player.medicalData?.height ?? null,
      weight: player.medicalData?.weight ?? null,
      torgIndex: player.medicalData?.torgIndex ?? null,
      healthInsurance: player.medicalData?.healthInsurance ?? '',
      bloodType: (player.medicalData?.bloodType as BloodTypeEnum) ?? null,
    },

    parentContacts: (player.parentContacts ?? []).map((pc) => ({
      name: pc.name ?? '',
      email: pc.email ?? '',
      phone: pc.phone ?? '',
    })),
  };
}

// helpers

function utcToLocalDate(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function mapAddress(value: PlayerFormValue) {
  const a = value.address;
  if (!a.phoneNumber) return undefined;

  return {
    street: a.street || undefined,
    number: a.number || undefined,
    floorApartment: a.floorApartment || undefined,
    city: a.city || undefined,
    postalCode: a.postalCode || undefined,
    neighborhood: a.neighborhood || undefined,
    phoneNumber: a.phoneNumber,
  };
}

function mapMedicalData(value: PlayerFormValue) {
  const m = {
    height: value.medicalData.height ?? undefined,
    weight: value.medicalData.weight ?? undefined,
    torgIndex: value.medicalData.torgIndex ?? undefined,
    healthInsurance: value.medicalData.healthInsurance || undefined,
    bloodType: value.medicalData.bloodType ?? undefined,
  };
  return Object.values(m).some((v) => v !== undefined) ? m : undefined;
}

function mapClothingSizes(value: PlayerFormValue) {
  const c = {
    jersey: value.clothingSizes.jersey ?? undefined,
    shorts: value.clothingSizes.shorts ?? undefined,
    sweater: value.clothingSizes.sweater ?? undefined,
    pants: value.clothingSizes.pants ?? undefined,
  };
  return Object.values(c).some((v) => v !== undefined) ? c : undefined;
}

function mapAvailability(value: PlayerFormValue) {
  if (
    value.availabilityStatus === PlayerAvailabilityEnum.AVAILABLE &&
    !value.availabilityReason
  ) {
    return undefined;
  }
  return {
    status: value.availabilityStatus,
    reason: value.availabilityReason || undefined,
    since: value.availabilitySince
      ? format(value.availabilitySince, DATE_FORMAT)
      : undefined,
    estimatedReturn: value.availabilityEstimatedReturn
      ? format(value.availabilityEstimatedReturn, DATE_FORMAT)
      : undefined,
  };
}

function mapParentContacts(value: PlayerFormValue) {
  const contacts = value.parentContacts
    .filter((pc) => pc.name)
    .map((pc) => ({
      name: pc.name,
      email: pc.email || undefined,
      phone: pc.phone || undefined,
    }));
  return contacts.length ? contacts : undefined;
}
