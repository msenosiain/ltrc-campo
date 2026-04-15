import { CategoryEnum, SportEnum } from '../enums';
import { PlayerFeeStatusEnum } from '../enums/player-fee-status.enum';

export interface PlayerFeeBlock {
  name: string;
  categories: CategoryEnum[];
  amount: number;
}

export interface PlayerFeePriceTier {
  validUntil: Date;
  amountOverride: number;
}

export interface IPlayerFeeConfig {
  id: string;
  season: string;
  sport: SportEnum;
  feeType: string;
  label: string;
  description?: string;
  addMpFee: boolean;
  mpFeeRate: number;
  expiresAt: Date;
  active: boolean;
  linkToken: string;
  familyDiscount: boolean;
  blocks: PlayerFeeBlock[];
  priceTiers?: PlayerFeePriceTier[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IFamilyGroupMember {
  playerId: string;
  playerName?: string;
  order: 1 | 2 | 3;
}

export interface IFamilyGroup {
  id: string;
  name: string;
  sport: SportEnum;
  members: IFamilyGroupMember[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IPlayerFeePayment {
  id: string;
  playerId: string;
  playerName?: string;
  playerDni?: string;
  configId: string;
  season: string;
  sport: SportEnum;
  originalAmount: number;
  discountPct?: number;
  discountReason?: string;
  finalAmount: number;
  mpFeeAdded?: number;
  status: PlayerFeeStatusEnum;
  mpPaymentId?: string;
  mpPreferenceId?: string;
  mpExternalReference?: string;
  mpStatusDetail?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPlayerSeasonRecord {
  id?: string;
  playerId: string;
  season: string;
  sport: SportEnum;
  fichaMedica: boolean;
  fichaMedicaFecha?: Date;
  cursosAprobados: boolean;
  cursosFecha?: Date;
  fichajeBDUAR: boolean;
  fichajeUnion: boolean;
  fondoSolidarioPagado: boolean;
  fondoSolidarioFecha?: Date;
  notes?: string;
  updatedBy?: string;
  updatedAt?: Date;
}

export interface IPlayerFeePublicInfo {
  linkToken: string;
  label: string;
  description?: string;
  season: string;
  sport: SportEnum;
  expiresAt: Date;
}

export interface IPlayerFeeValidateResult {
  playerId: string;
  playerName: string;
  playerDni: string;
  category: string;
  blockName: string;
  originalAmount: number;
  discountPct?: number;
  discountReason?: string;
  finalAmount: number;
  mpFeeAdded?: number;
  totalAmount: number;
  alreadyPaid: boolean;
}

export interface IPlayerFeeStatusRow {
  playerId: string;
  playerName: string;
  playerDni: string;
  category: string;
  // Pago
  feePaid: boolean;
  feeAmount?: number;
  feePaidAt?: Date;
  // Habilitación
  fichaMedica: boolean;
  cursosAprobados: boolean;
  fichajeBDUAR: boolean;
  fichajeUnion: boolean;
  fondoSolidarioPagado?: boolean;  // solo si aplica (M15→PS rugby)
  // Estado general
  habilitado: boolean;
}
