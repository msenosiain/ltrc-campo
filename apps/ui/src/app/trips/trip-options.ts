import {
  TransportTypeEnum,
  TripParticipantStatusEnum,
  TripParticipantTypeEnum,
  TripStatusEnum,
} from '@ltrc-campo/shared-api-model';

export interface TripOption<T> {
  id: T;
  label: string;
}

export const tripStatusOptions: TripOption<TripStatusEnum>[] = [
  { id: TripStatusEnum.DRAFT, label: 'Borrador' },
  { id: TripStatusEnum.OPEN, label: 'Abierto' },
  { id: TripStatusEnum.CLOSED, label: 'Cerrado' },
  { id: TripStatusEnum.COMPLETED, label: 'Completado' },
];

export const transportTypeOptions: TripOption<TransportTypeEnum>[] = [
  { id: TransportTypeEnum.BUS, label: 'Colectivo' },
  { id: TransportTypeEnum.PLANE, label: 'Avión' },
  { id: TransportTypeEnum.MINIVAN, label: 'Traffic / Combi' },
  { id: TransportTypeEnum.OTHER, label: 'Otro' },
];

export const participantTypeOptions: TripOption<TripParticipantTypeEnum>[] = [
  { id: TripParticipantTypeEnum.PLAYER, label: 'Jugador' },
  { id: TripParticipantTypeEnum.STAFF, label: 'Staff' },
  { id: TripParticipantTypeEnum.EXTERNAL, label: 'Externo (padre/acompañante)' },
];

export const participantStatusOptions: TripOption<TripParticipantStatusEnum>[] = [
  { id: TripParticipantStatusEnum.PENDING, label: 'Pendiente' },
  { id: TripParticipantStatusEnum.CONFIRMED, label: 'Confirmado' },
];

export function getTripStatusLabel(status: TripStatusEnum): string {
  return tripStatusOptions.find((o) => o.id === status)?.label ?? status;
}

export function getTransportTypeLabel(type: TransportTypeEnum): string {
  return transportTypeOptions.find((o) => o.id === type)?.label ?? type;
}

export function getParticipantTypeLabel(type: TripParticipantTypeEnum): string {
  return participantTypeOptions.find((o) => o.id === type)?.label ?? type;
}

export function getParticipantStatusLabel(status: TripParticipantStatusEnum): string {
  return participantStatusOptions.find((o) => o.id === status)?.label ?? status;
}
