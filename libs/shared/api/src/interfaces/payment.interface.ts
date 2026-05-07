import {
  PaymentEntityTypeEnum,
  PaymentLinkStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
} from '../enums';

export interface IPaymentLink {
  id: string;
  linkToken: string;
  entityType: PaymentEntityTypeEnum;
  entityId: string;
  entityIds?: string[];
  concept: string;
  description?: string;
  amount: number;
  addMpFee: boolean;
  mpFeeRate: number;
  mpFeeAmount: number;
  netAmount: number;
  paymentType: PaymentTypeEnum;
  installmentNumber?: number;
  installmentTotal?: number;
  expiresAt: Date;
  status: PaymentLinkStatusEnum;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPayment {
  id: string;
  paymentLinkId?: string;
  entityType: PaymentEntityTypeEnum;
  entityId: string;
  playerId: string;
  playerName?: string;
  playerDni?: string;
  amount: number;
  method: PaymentMethodEnum;
  status: PaymentStatusEnum;
  concept: string;
  mpPaymentId?: string;
  mpPreferenceId?: string;
  mpStatusDetail?: string;
  date: Date;
  notes?: string;
  recordedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPaymentLinkPublicInfo {
  linkToken: string;
  concept: string;
  description?: string;
  amount: number;
  mpFeeRate: number;
  mpFeeAmount: number;
  netAmount: number;
  paymentType: PaymentTypeEnum;
  installmentNumber?: number;
  installmentTotal?: number;
  expiresAt: Date;
  entityType: PaymentEntityTypeEnum;
  entityLabel: string;
  matchDate?: string;
  matchTime?: string;
  matchOpponents?: string;
  matchCategories?: string[];
  matchTournamentName?: string;
}
