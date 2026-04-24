jest.mock('mercadopago', () => {
  const mockPreferenceCreate = jest.fn();
  const mockPaymentGet = jest.fn();
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({})),
    Preference: jest.fn().mockImplementation(() => ({ create: mockPreferenceCreate })),
    Payment: jest.fn().mockImplementation(() => ({ get: mockPaymentGet })),
    _mockPreferenceCreate: mockPreferenceCreate,
    _mockPaymentGet: mockPaymentGet,
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, GoneException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import * as MercadoPago from 'mercadopago';
import { PaymentsService } from './payments.service';
import { PaymentLinkEntity } from './schemas/payment-link.entity';
import { PaymentEntity } from './schemas/payment.entity';
import { PAYMENT_CONFIG_MODEL } from './schemas/payment-config.entity';
import { PlayerEntity } from '../players/schemas/player.entity';
import { MatchEntity } from '../matches/schemas/match.entity';
import { TripEntity } from '../trips/schemas/trip.entity';
import { User } from '../users/schemas/user.schema';
import {
  PaymentEntityTypeEnum,
  PaymentLinkStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  PaymentTypeEnum,
} from '@ltrc-campo/shared-api-model';

// ── helpers ──────────────────────────────────────────────────────────────────

const oid = (s = 'aaaaaaaaaaaaaaaaaaaaaaaa') => new Types.ObjectId(s);

const makeLink = (overrides: Record<string, unknown> = {}) => ({
  _id: oid(),
  linkToken: 'tok-1',
  entityType: PaymentEntityTypeEnum.MATCH,
  entityId: oid(),
  concept: 'Tercer tiempo',
  amount: 1100,
  mpFeeRate: 0.0483,
  mpFeeAmount: 53.13,
  netAmount: 1046.87,
  paymentType: PaymentTypeEnum.FULL,
  expiresAt: new Date(Date.now() + 86_400_000), // tomorrow
  status: PaymentLinkStatusEnum.ACTIVE,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makePayment = (overrides: Record<string, unknown> = {}) => ({
  _id: oid('bbbbbbbbbbbbbbbbbbbbbbbb'),
  id: 'pay-1',
  method: PaymentMethodEnum.CASH,
  status: PaymentStatusEnum.APPROVED,
  save: jest.fn().mockResolvedValue(undefined),
  deleteOne: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mockUser = { _id: oid('cccccccccccccccccccccccc') };

// ── mock models ───────────────────────────────────────────────────────────────

const makeMockModel = () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  find: jest.fn(),
  distinct: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
  sort: jest.fn(),
  lean: jest.fn(),
  populate: jest.fn(),
});

let mockLinkModel: ReturnType<typeof makeMockModel>;
let mockPaymentModel: ReturnType<typeof makeMockModel>;
let mockPlayerModel: ReturnType<typeof makeMockModel>;
let mockMatchModel: ReturnType<typeof makeMockModel>;
let mockTripModel: ReturnType<typeof makeMockModel>;
let mockPaymentConfigModel: ReturnType<typeof makeMockModel>;

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PaymentsService', () => {
  let service: PaymentsService;
  let mpPreferenceCreate: jest.Mock;
  let mpPaymentGet: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockLinkModel = makeMockModel();
    mockPaymentModel = makeMockModel();
    mockPaymentConfigModel = makeMockModel();
    mockPaymentConfigModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    mockPaymentConfigModel.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue({ excludedPaymentTypes: [] }) });
    mockPlayerModel = makeMockModel();
    mockMatchModel = makeMockModel();
    mockTripModel = makeMockModel();

    mpPreferenceCreate = (MercadoPago as any)._mockPreferenceCreate;
    mpPaymentGet = (MercadoPago as any)._mockPaymentGet;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getModelToken(PaymentLinkEntity.name), useValue: mockLinkModel },
        { provide: getModelToken(PaymentEntity.name), useValue: mockPaymentModel },
        { provide: getModelToken(PAYMENT_CONFIG_MODEL), useValue: mockPaymentConfigModel },
        { provide: getModelToken(PlayerEntity.name), useValue: mockPlayerModel },
        { provide: getModelToken(MatchEntity.name), useValue: mockMatchModel },
        { provide: getModelToken(TripEntity.name), useValue: mockTripModel },
        { provide: getModelToken(User.name), useValue: { findOne: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def: unknown) => {
              if (key === 'MP_FEE_RATE') return 4.83;
              if (key === 'MP_ACCESS_TOKEN') return 'test-token';
              if (key === 'APP_BASE_URL') return 'http://localhost:4200';
              return def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── calculateFee ────────────────────────────────────────────────────────────

  describe('calculateFee()', () => {
    it('should compute grossAmount rounded up to nearest 10', () => {
      const { grossAmount } = service.calculateFee(1000);
      // rawGross ≈ 1000 / (1 - 0.0483) ≈ 1050.7 → ceil to nearest 10 = 1060
      expect(grossAmount % 10).toBe(0);
      expect(grossAmount).toBeGreaterThanOrEqual(1000);
    });

    it('should return correct mpFeeRate', () => {
      const { mpFeeRate } = service.calculateFee(500);
      expect(mpFeeRate).toBeCloseTo(0.0483);
    });

    it('netAmount should be close to the requested net target', () => {
      const target = 1000;
      const { netAmount, grossAmount, mpFeeAmount } = service.calculateFee(target);
      expect(Math.abs(netAmount + mpFeeAmount - grossAmount)).toBeLessThan(0.01);
    });
  });

  // ── getConfig ───────────────────────────────────────────────────────────────

  describe('getConfig()', () => {
    it('should return mpFeeRate and excludedPaymentTypes', async () => {
      const result = await service.getConfig();
      expect(result).toEqual({ mpFeeRate: expect.any(Number), excludedPaymentTypes: [] });
    });
  });

  // ── getFieldOptions ─────────────────────────────────────────────────────────

  describe('getFieldOptions()', () => {
    it('should return sorted concepts', async () => {
      mockLinkModel.distinct.mockResolvedValue(['Viaje', 'Tercer tiempo']);
      const result = await service.getFieldOptions();
      expect(result).toEqual({ concepts: ['Tercer tiempo', 'Viaje'] });
    });
  });

  // ── createLink ──────────────────────────────────────────────────────────────

  describe('createLink()', () => {
    const dto = {
      entityId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      entityType: PaymentEntityTypeEnum.MATCH,
      concept: 'Tercer tiempo',
      amount: 1000,
      paymentType: PaymentTypeEnum.FULL,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    } as any;

    it('should create and return the link', async () => {
      const created = makeLink();
      mockLinkModel.create.mockResolvedValue(created);

      const result = await service.createLink(dto, mockUser as any);
      expect(mockLinkModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          concept: 'Tercer tiempo',
          status: PaymentLinkStatusEnum.ACTIVE,
          entityType: PaymentEntityTypeEnum.MATCH,
        })
      );
      expect(result).toBe(created);
    });

    it('should throw BadRequestException when neither entityId nor entityIds provided', async () => {
      await expect(
        service.createLink({ ...dto, entityId: undefined }, mockUser as any)
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept entityIds array', async () => {
      const created = makeLink();
      mockLinkModel.create.mockResolvedValue(created);
      const dtoWithIds = { ...dto, entityId: undefined, entityIds: ['aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb'] };
      await service.createLink(dtoWithIds, mockUser as any);
      expect(mockLinkModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ entityIds: expect.any(Array) })
      );
    });
  });

  // ── getLinksForEntity ───────────────────────────────────────────────────────

  describe('getLinksForEntity()', () => {
    it('should query by entityType and entityId', async () => {
      const links = [makeLink()];
      mockLinkModel.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(links) });
      const result = await service.getLinksForEntity(PaymentEntityTypeEnum.MATCH, 'aaaaaaaaaaaaaaaaaaaaaaaa');
      expect(result).toEqual(links);
    });
  });

  // ── cancelLink ──────────────────────────────────────────────────────────────

  describe('cancelLink()', () => {
    it('should set status to CANCELLED and save', async () => {
      const link = makeLink();
      mockLinkModel.findById.mockResolvedValue(link);
      await service.cancelLink('aaaaaaaaaaaaaaaaaaaaaaaa');
      expect(link.status).toBe(PaymentLinkStatusEnum.CANCELLED);
      expect(link.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when link not found', async () => {
      mockLinkModel.findById.mockResolvedValue(null);
      await expect(service.cancelLink('aaaaaaaaaaaaaaaaaaaaaaaa')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getPublicLinkInfo ───────────────────────────────────────────────────────

  describe('getPublicLinkInfo()', () => {
    const mockMatch = { _id: oid(), date: new Date(), opponent: 'Rival', category: 'cuarta', name: null };

    it('should return link info for an active link', async () => {
      const link = makeLink();
      mockLinkModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(link) });
      const selectResult = { lean: jest.fn().mockResolvedValue(mockMatch), populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockMatch) }) };
      mockMatchModel.findById.mockReturnValue({ select: jest.fn().mockReturnValue(selectResult) });
      const findSelectResult = { lean: jest.fn().mockResolvedValue([mockMatch]), populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([mockMatch]) }) };
      mockMatchModel.find.mockReturnValue({ select: jest.fn().mockReturnValue(findSelectResult) });

      const result = await service.getPublicLinkInfo('tok-1');
      expect(result.linkToken).toBe('tok-1');
      expect(result.concept).toBe('Tercer tiempo');
    });

    it('should throw NotFoundException when link does not exist', async () => {
      mockLinkModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      await expect(service.getPublicLinkInfo('bad-token')).rejects.toThrow(NotFoundException);
    });

    it('should throw GoneException when link is cancelled', async () => {
      const link = makeLink({ status: PaymentLinkStatusEnum.CANCELLED });
      mockLinkModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(link) });
      await expect(service.getPublicLinkInfo('tok-1')).rejects.toThrow(GoneException);
    });

    it('should throw GoneException when link has expired', async () => {
      const link = makeLink({ expiresAt: new Date(Date.now() - 86_400_000) });
      mockLinkModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(link) });
      await expect(service.getPublicLinkInfo('tok-1')).rejects.toThrow(GoneException);
    });
  });

  // ── validateDni ─────────────────────────────────────────────────────────────

  describe('validateDni()', () => {
    const mockPlayer = { _id: oid('dddddddddddddddddddddddd'), name: 'Ana García', idNumber: '12345678', category: 'cuarta' };

    it('should return playerId and playerName on valid DNI', async () => {
      const link = makeLink();
      mockLinkModel.findOne.mockResolvedValue(link);
      mockPlayerModel.findOne.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockPlayer) }) });
      // category check — match has same category as player so no mismatch
      mockMatchModel.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ category: 'cuarta' }) }) });

      const result = await service.validateDni('tok-1', '12345678');
      expect(result).toEqual({ playerId: expect.any(String), playerName: 'Ana García' });
    });

    it('should throw NotFoundException when link not found', async () => {
      mockLinkModel.findOne.mockResolvedValue(null);
      await expect(service.validateDni('bad', '12345678')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when player not found', async () => {
      mockLinkModel.findOne.mockResolvedValue(makeLink());
      mockPlayerModel.findOne.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
      await expect(service.validateDni('tok-1', '99999999')).rejects.toThrow(NotFoundException);
    });

    it('should throw 400 CATEGORY_MISMATCH when match category differs from player category', async () => {
      const link = makeLink();
      mockLinkModel.findOne.mockResolvedValue(link);
      mockPlayerModel.findOne.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ ...mockPlayer, category: 'novena' }) }) });
      mockMatchModel.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ category: 'cuarta' }) }) });

      await expect(service.validateDni('tok-1', '12345678')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CATEGORY_MISMATCH' }),
      });
    });
  });

  // ── recordManualPayment ──────────────────────────────────────────────────────

  describe('recordManualPayment()', () => {
    const dto = {
      entityType: PaymentEntityTypeEnum.MATCH,
      entityId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      playerId: 'dddddddddddddddddddddddd',
      amount: 500,
      method: PaymentMethodEnum.CASH,
      concept: 'Cuota',
      date: new Date().toISOString(),
    } as any;

    it('should create and return the payment', async () => {
      const payment = makePayment();
      mockPlayerModel.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: oid() }) }) });
      mockPaymentModel.create.mockResolvedValue(payment);

      const result = await service.recordManualPayment(dto, mockUser as any);
      expect(mockPaymentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ method: PaymentMethodEnum.CASH, status: PaymentStatusEnum.APPROVED })
      );
      expect(result).toBe(payment);
    });

    it('should throw NotFoundException when player does not exist', async () => {
      mockPlayerModel.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
      await expect(service.recordManualPayment(dto, mockUser as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ── deleteManualPayment ──────────────────────────────────────────────────────

  describe('deleteManualPayment()', () => {
    it('should delete a manual payment successfully', async () => {
      const payment = makePayment({ method: PaymentMethodEnum.CASH });
      mockPaymentModel.findById.mockResolvedValue(payment);

      await service.deleteManualPayment('pay-1');
      expect(payment.deleteOne).toHaveBeenCalled();
    });

    it('should throw NotFoundException when payment not found', async () => {
      mockPaymentModel.findById.mockResolvedValue(null);
      await expect(service.deleteManualPayment('pay-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for MercadoPago payments', async () => {
      const payment = makePayment({ method: PaymentMethodEnum.MERCADOPAGO });
      mockPaymentModel.findById.mockResolvedValue(payment);
      await expect(service.deleteManualPayment('pay-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── getPaymentsForEntity ─────────────────────────────────────────────────────

  describe('getPaymentsForEntity()', () => {
    it('should query and populate payments', async () => {
      const payments = [makePayment()];
      mockPaymentModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(payments) }),
      });
      const result = await service.getPaymentsForEntity(PaymentEntityTypeEnum.MATCH, 'aaaaaaaaaaaaaaaaaaaaaaaa');
      expect(result).toEqual(payments);
    });
  });

  // ── findPlayerByDni ──────────────────────────────────────────────────────────

  describe('findPlayerByDni()', () => {
    it('should return player info when found', async () => {
      mockPlayerModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: oid(), name: 'Ana', idNumber: '12345678' }) }),
      });
      const result = await service.findPlayerByDni('12345678');
      expect(result.playerName).toBe('Ana');
    });

    it('should throw NotFoundException when not found', async () => {
      mockPlayerModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      });
      await expect(service.findPlayerByDni('99999999')).rejects.toThrow(NotFoundException);
    });
  });

  // ── confirmPayment ───────────────────────────────────────────────────────────

  describe('confirmPayment()', () => {
    it('should update status from redirect params when no paymentId', async () => {
      const payment = makePayment({ status: PaymentStatusEnum.PENDING });
      mockPaymentModel.findOne.mockResolvedValue(payment);

      const result = await service.confirmPayment({ externalReference: 'ref-1', status: 'approved' } as any);
      expect(payment.status).toBe(PaymentStatusEnum.APPROVED);
      expect(payment.save).toHaveBeenCalled();
      expect(result.status).toBe(PaymentStatusEnum.APPROVED);
    });

    it('should throw NotFoundException when payment not found', async () => {
      mockPaymentModel.findOne.mockResolvedValue(null);
      await expect(service.confirmPayment({ externalReference: 'ref-1' } as any)).rejects.toThrow(NotFoundException);
    });

    it('should verify with MP API when paymentId is provided', async () => {
      const payment = makePayment({ status: PaymentStatusEnum.PENDING });
      mockPaymentModel.findOne.mockResolvedValue(payment);
      mpPaymentGet.mockResolvedValue({ id: 'mp-123', status: 'approved', status_detail: 'accredited', date_approved: new Date().toISOString() });

      const result = await service.confirmPayment({ externalReference: 'ref-1', paymentId: 'mp-123' } as any);
      expect(mpPaymentGet).toHaveBeenCalledWith({ id: 'mp-123' });
      expect(payment.status).toBe(PaymentStatusEnum.APPROVED);
      expect(result.status).toBe(PaymentStatusEnum.APPROVED);
    });

    it('should fall back to redirect status when MP API call fails', async () => {
      const payment = makePayment({ status: PaymentStatusEnum.PENDING });
      mockPaymentModel.findOne.mockResolvedValue(payment);
      mpPaymentGet.mockRejectedValue(new Error('MP timeout'));

      const result = await service.confirmPayment({ externalReference: 'ref-1', paymentId: 'mp-123', status: 'rejected' } as any);
      expect(payment.status).toBe(PaymentStatusEnum.REJECTED);
      expect(result.status).toBe(PaymentStatusEnum.REJECTED);
    });
  });

  // ── mapMpStatus (via confirmPayment) ─────────────────────────────────────────

  describe('MP status mapping', () => {
    const cases: Array<[string, PaymentStatusEnum]> = [
      ['approved', PaymentStatusEnum.APPROVED],
      ['in_process', PaymentStatusEnum.IN_PROCESS],
      ['authorized', PaymentStatusEnum.IN_PROCESS],
      ['rejected', PaymentStatusEnum.REJECTED],
      ['cancelled', PaymentStatusEnum.CANCELLED],
      ['other', PaymentStatusEnum.PENDING],
    ];

    test.each(cases)('"%s" → %s', async (mpStatus, expected) => {
      const payment = makePayment({ status: PaymentStatusEnum.PENDING });
      mockPaymentModel.findOne.mockResolvedValue(payment);
      await service.confirmPayment({ externalReference: 'ref-1', status: mpStatus } as any);
      expect(payment.status).toBe(expected);
    });
  });

  // ── getStats ─────────────────────────────────────────────────────────────────

  describe('getStats()', () => {
    const makeLinkFindResult = () => ({
      distinct: jest.fn().mockResolvedValue([]),
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      }),
    });

    beforeEach(() => {
      mockLinkModel.find.mockImplementation(() => makeLinkFindResult());
      mockLinkModel.countDocuments.mockResolvedValue(2);
      // First aggregate: byMethodRaw; second: paymentCounts (empty — no recent links)
      mockPaymentModel.aggregate
        .mockResolvedValueOnce([
          { _id: PaymentMethodEnum.MERCADOPAGO, count: 3 },
          { _id: PaymentMethodEnum.CASH, count: 1 },
        ])
        .mockResolvedValueOnce([]);
    });

    it('should return correct mpAdoptionPct', async () => {
      const result = await service.getStats();
      // 3 MP out of 4 total = 75%
      expect(result.mpAdoptionPct).toBe(75);
      expect(result.byMethod).toEqual({ mp: 3, cash: 1 });
    });

    it('should return 0% adoption when no payments', async () => {
      mockPaymentModel.aggregate.mockReset().mockResolvedValue([]);
      const result = await service.getStats();
      expect(result.mpAdoptionPct).toBe(0);
    });

    it('should return activePendingLinks count', async () => {
      mockLinkModel.countDocuments.mockResolvedValue(5);
      const result = await service.getStats();
      expect(result.activePendingLinks).toBe(5);
    });

    it('should apply sport scope filter when sport provided', async () => {
      mockMatchModel.find.mockReturnValue({ distinct: jest.fn().mockResolvedValue(['id1']) });
      mockTripModel.find.mockReturnValue({ distinct: jest.fn().mockResolvedValue([]) });
      // link model find still needs both chains for the sport path
      mockLinkModel.find.mockImplementation(() => makeLinkFindResult());

      await service.getStats('rugby');

      expect(mockMatchModel.find).toHaveBeenCalledWith({ sport: 'rugby' });
      expect(mockTripModel.find).toHaveBeenCalledWith({ sport: 'rugby' });
    });
  });
});
