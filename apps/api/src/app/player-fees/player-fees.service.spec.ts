import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { PlayerFeesService } from './player-fees.service';
import { PlayerFeeConfigEntity } from './schemas/player-fee-config.entity';
import { FamilyGroupEntity } from './schemas/family-group.entity';
import { PlayerFeePaymentEntity } from './schemas/player-fee-payment.entity';
import { PlayerSeasonRecordEntity } from './schemas/player-season-record.entity';
import { PlayerEntity } from '../players/schemas/player.entity';
import { PaymentEntity } from '../payments/schemas/payment.entity';
import {
  CategoryEnum,
  PaymentMethodEnum,
  PlayerFeeStatusEnum,
  SportEnum,
} from '@ltrc-campo/shared-api-model';

jest.mock('mercadopago', () => {
  const mockPreferenceCreate = jest.fn().mockResolvedValue({
    id: 'pref-123',
    init_point: 'https://mp.com/checkout/123',
    sandbox_init_point: 'https://sandbox.mp.com/checkout/123',
  });
  const MockPreference = jest.fn().mockImplementation(() => ({ create: mockPreferenceCreate }));
  (MockPreference as any)._mockCreate = mockPreferenceCreate;

  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({})),
    Preference: MockPreference,
    Payment: jest.fn().mockImplementation(() => ({ get: jest.fn() })),
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const oid = (s = '000000000000000000000001') => new Types.ObjectId(s);

const makeConfig = (overrides: Partial<any> = {}): any => ({
  _id: oid('aaaaaaaaaaaaaaaaaaaaaaaa'),
  id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  season: '2025',
  sport: SportEnum.RUGBY,
  feeType: 'rugby',
  label: 'Derecho Rugby 2025',
  addMpFee: false,
  mpFeeRate: 0.05,
  active: true,
  linkToken: 'tok-abc',
  familyDiscount: false,
  blocks: [
    {
      name: 'PS',
      categories: [CategoryEnum.PLANTEL_SUPERIOR],
      amount: 10000,
      expiresAt: new Date('2099-12-31'),
    },
    {
      name: 'M15',
      categories: [CategoryEnum.M15, CategoryEnum.M16],
      amount: 7000,
      expiresAt: new Date('2099-12-31'),
    },
  ],
  ...overrides,
});

const makePlayer = (overrides: Partial<any> = {}): any => ({
  _id: oid('bbbbbbbbbbbbbbbbbbbbbbbb'),
  id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  name: 'Juan Pérez',
  idNumber: '12345678',
  category: CategoryEnum.PLANTEL_SUPERIOR,
  sport: SportEnum.RUGBY,
  ...overrides,
});

const makePayment = (overrides: Partial<any> = {}): any => ({
  _id: oid('cccccccccccccccccccccccc'),
  id: 'cccccccccccccccccccccccc',
  status: PlayerFeeStatusEnum.APPROVED,
  ...overrides,
});

// ── Mock models ───────────────────────────────────────────────────────────────

const makeFindOne = (value: any) => jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) });
const mockConfigModel = {
  findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
};
const mockFamilyGroupModel = { findOne: jest.fn() };
const mockPaymentModel = { findOne: jest.fn(), create: jest.fn(), exists: jest.fn(), find: jest.fn(), countDocuments: jest.fn(), findByIdAndUpdate: jest.fn() };
const mockSeasonRecordModel = { findOne: jest.fn(), create: jest.fn(), findOneAndUpdate: jest.fn(), find: jest.fn() };
const mockPlayerModel = { findOne: jest.fn(), findById: jest.fn(), find: jest.fn() };
const mockGeneralPaymentModel = { create: jest.fn(), find: jest.fn(), exists: jest.fn(), distinct: jest.fn() };

// ── Suite ────────────────────────────────────────────────────────────────────

describe('PlayerFeesService', () => {
  let service: PlayerFeesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerFeesService,
        { provide: getModelToken(PlayerFeeConfigEntity.name), useValue: mockConfigModel },
        { provide: getModelToken(FamilyGroupEntity.name), useValue: mockFamilyGroupModel },
        { provide: getModelToken(PlayerFeePaymentEntity.name), useValue: mockPaymentModel },
        { provide: getModelToken(PlayerSeasonRecordEntity.name), useValue: mockSeasonRecordModel },
        { provide: getModelToken(PlayerEntity.name), useValue: mockPlayerModel },
        { provide: getModelToken(PaymentEntity.name), useValue: mockGeneralPaymentModel },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              if (key === 'MP_FEE_RATE') return '0.05';
              if (key === 'MP_ACCESS_TOKEN') return 'test-token';
              if (key === 'APP_BASE_URL') return 'http://localhost:4200';
              return def ?? undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(PlayerFeesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── resolveAmountForCategory ─────────────────────────────────────────────

  describe('resolveAmountForCategory()', () => {
    it('returns null when category is not in any block', () => {
      const config = makeConfig();
      const result = service.resolveAmountForCategory(config, CategoryEnum.M8);
      expect(result).toBeNull();
    });

    it('returns amount and blockName for matching category', () => {
      const config = makeConfig();
      const result = service.resolveAmountForCategory(config, CategoryEnum.PLANTEL_SUPERIOR);
      expect(result).toMatchObject({ blockName: 'PS', amount: 10000 });
    });

    it('returns blockExpiresAt from the matched block', () => {
      const expiry = new Date('2025-06-30');
      const config = makeConfig({
        blocks: [{ name: 'PS', categories: [CategoryEnum.PLANTEL_SUPERIOR], amount: 10000, expiresAt: expiry }],
      });
      const result = service.resolveAmountForCategory(config, CategoryEnum.PLANTEL_SUPERIOR);
      expect(result?.blockExpiresAt).toEqual(expiry);
    });

    it('matches a category in a multi-category block', () => {
      const config = makeConfig();
      const result = service.resolveAmountForCategory(config, CategoryEnum.M16);
      expect(result).toMatchObject({ blockName: 'M15', amount: 7000 });
    });
  });

  // ── getConfigByToken ──────────────────────────────────────────────────────

  describe('getConfigByToken()', () => {
    it('returns config when found and active', async () => {
      const config = makeConfig();
      mockConfigModel.findOne.mockResolvedValueOnce(config);
      const result = await (service as any).getConfigByToken('tok-abc');
      expect(result).toBe(config);
      expect(mockConfigModel.findOne).toHaveBeenCalledWith({ linkToken: 'tok-abc', active: true });
    });

    it('throws NotFoundException when config not found', async () => {
      mockConfigModel.findOne.mockResolvedValueOnce(null);
      await expect((service as any).getConfigByToken('bad-token')).rejects.toThrow(NotFoundException);
    });
  });

  // ── validatePlayerFee ────────────────────────────────────────────────────

  describe('validatePlayerFee()', () => {
    beforeEach(() => {
      mockConfigModel.findOne.mockResolvedValue(makeConfig());
      mockPlayerModel.findOne.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(makePlayer()) });
      mockPaymentModel.exists.mockResolvedValue(null);
    });

    it('returns validate result with correct amounts when no discount and no MP fee', async () => {
      const result = await service.validatePlayerFee('tok-abc', '12345678');
      expect(result.originalAmount).toBe(10000);
      expect(result.totalAmount).toBe(10000);
      expect(result.discountPct).toBeUndefined();
      expect(result.mpFeeAdded).toBeUndefined();
      expect(result.alreadyPaid).toBe(false);
    });

    it('adds MP fee when addMpFee is true', async () => {
      mockConfigModel.findOne.mockResolvedValue(makeConfig({ addMpFee: true }));
      const result = await service.validatePlayerFee('tok-abc', '12345678');
      expect(result.mpFeeAdded).toBe(500); // 10000 * 0.05
      expect(result.totalAmount).toBe(10500);
    });

    it('marks alreadyPaid when approved payment exists', async () => {
      mockPaymentModel.exists.mockResolvedValue({ _id: oid() });
      const result = await service.validatePlayerFee('tok-abc', '12345678');
      expect(result.alreadyPaid).toBe(true);
    });

    it('throws NotFoundException when player not found', async () => {
      mockPlayerModel.findOne.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) });
      await expect(service.validatePlayerFee('tok-abc', '99999999')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when category is not in config blocks', async () => {
      mockPlayerModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(makePlayer({ category: CategoryEnum.M8 })),
      });
      await expect(service.validatePlayerFee('tok-abc', '12345678')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when block is expired', async () => {
      mockConfigModel.findOne.mockResolvedValue(makeConfig({
        blocks: [{ name: 'PS', categories: [CategoryEnum.PLANTEL_SUPERIOR], amount: 10000, expiresAt: new Date('2000-01-01') }],
      }));
      await expect(service.validatePlayerFee('tok-abc', '12345678')).rejects.toThrow(BadRequestException);
    });

    it('applies family discount when familyDiscount is enabled', async () => {
      const playerId = oid('bbbbbbbbbbbbbbbbbbbbbbbb');
      const siblingId = oid('dddddddddddddddddddddddd');

      mockConfigModel.findOne.mockResolvedValue(makeConfig({ familyDiscount: true }));
      mockFamilyGroupModel.findOne.mockResolvedValue({
        members: [
          { playerId: siblingId, order: 1 },
          { playerId, order: 2 },
        ],
      });
      mockPlayerModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { _id: siblingId, category: CategoryEnum.PLANTEL_SUPERIOR },  // 10000
          { _id: playerId, category: CategoryEnum.PLANTEL_SUPERIOR },   // 10000 — tiebreaker: order 1 is "more expensive"
        ]),
      });

      const result = await service.validatePlayerFee('tok-abc', '12345678');
      expect(result.discountPct).toBe(25);
      expect(result.totalAmount).toBe(7500); // 10000 * 0.75
    });
  });

  // ── resolveFamilyDiscount ────────────────────────────────────────────────

  describe('resolveFamilyDiscount()', () => {
    const configId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const playerId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const siblingId = 'dddddddddddddddddddddddd';
    const thirdId = 'eeeeeeeeeeeeeeeeeeeeeeee';

    const config = makeConfig({ familyDiscount: true });

    it('returns null when player has no family group', async () => {
      mockFamilyGroupModel.findOne.mockResolvedValue(null);
      const result = await (service as any).resolveFamilyDiscount(config, playerId, SportEnum.RUGBY);
      expect(result).toBeNull();
    });

    it('returns null when family group has only 1 member', async () => {
      mockFamilyGroupModel.findOne.mockResolvedValue({
        members: [{ playerId: oid(playerId), order: 1 }],
      });
      const result = await (service as any).resolveFamilyDiscount(config, playerId, SportEnum.RUGBY);
      expect(result).toBeNull();
    });

    it('returns null when player has the highest amount (no discount)', async () => {
      mockFamilyGroupModel.findOne.mockResolvedValue({
        members: [
          { playerId: oid(playerId), order: 1 },
          { playerId: oid(siblingId), order: 2 },
        ],
      });
      mockPlayerModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { _id: oid(playerId), category: CategoryEnum.PLANTEL_SUPERIOR },  // 10000 — most expensive
          { _id: oid(siblingId), category: CategoryEnum.M15 },              // 7000
        ]),
      });
      const result = await (service as any).resolveFamilyDiscount(config, playerId, SportEnum.RUGBY);
      expect(result).toBeNull();
    });

    it('returns 25% discount for the cheaper of 2 members', async () => {
      mockFamilyGroupModel.findOne.mockResolvedValue({
        members: [
          { playerId: oid(siblingId), order: 1 },
          { playerId: oid(playerId), order: 2 },
        ],
      });
      mockPlayerModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { _id: oid(siblingId), category: CategoryEnum.PLANTEL_SUPERIOR }, // 10000
          { _id: oid(playerId), category: CategoryEnum.M15 },               // 7000 — cheaper
        ]),
      });
      const result = await (service as any).resolveFamilyDiscount(config, playerId, SportEnum.RUGBY);
      expect(result).toMatchObject({ discountPct: 25 });
    });

    it('returns 50% discount for 3rd cheapest member', async () => {
      mockFamilyGroupModel.findOne.mockResolvedValue({
        members: [
          { playerId: oid(siblingId), order: 1 },
          { playerId: oid(thirdId), order: 2 },
          { playerId: oid(playerId), order: 3 },
        ],
      });
      mockPlayerModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { _id: oid(siblingId), category: CategoryEnum.PLANTEL_SUPERIOR }, // 10000
          { _id: oid(thirdId), category: CategoryEnum.M15 },               // 7000
          { _id: oid(playerId), category: CategoryEnum.M16 },              // 7000 — tied, higher order = "cheaper"
        ]),
      });
      const result = await (service as any).resolveFamilyDiscount(config, playerId, SportEnum.RUGBY);
      expect(result).toMatchObject({ discountPct: 50 });
    });

    it('uses order as tiebreaker when amounts are equal', async () => {
      // Both players have PLANTEL_SUPERIOR (10000). Order 1 is "more expensive", order 2 gets discount.
      mockFamilyGroupModel.findOne.mockResolvedValue({
        members: [
          { playerId: oid(siblingId), order: 1 },
          { playerId: oid(playerId), order: 2 },
        ],
      });
      mockPlayerModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { _id: oid(siblingId), category: CategoryEnum.PLANTEL_SUPERIOR }, // 10000, order 1
          { _id: oid(playerId), category: CategoryEnum.PLANTEL_SUPERIOR },  // 10000, order 2 → discount
        ]),
      });
      const result = await (service as any).resolveFamilyDiscount(config, playerId, SportEnum.RUGBY);
      expect(result).toMatchObject({ discountPct: 25 });
    });
  });

  // ── previewManualPayment ─────────────────────────────────────────────────

  describe('previewManualPayment()', () => {
    const lean = (value: any) => ({ lean: jest.fn().mockResolvedValue(value) });

    it('returns nulls when no active config found', async () => {
      mockPlayerModel.findById.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(makePlayer()) });
      mockConfigModel.findOne.mockReturnValue(lean(null));
      const result = await service.previewManualPayment('bbbbbbbbbbbbbbbbbbbbbbbb', '2025', SportEnum.RUGBY);
      expect(result).toMatchObject({ originalAmount: null, finalAmount: null });
    });

    it('returns correct amounts with no discount', async () => {
      mockPlayerModel.findById.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(makePlayer()) });
      mockConfigModel.findOne.mockReturnValue(lean(makeConfig()));
      const result = await service.previewManualPayment('bbbbbbbbbbbbbbbbbbbbbbbb', '2025', SportEnum.RUGBY);
      expect(result.originalAmount).toBe(10000);
      expect(result.finalAmount).toBe(10000);
      expect(result.discountPct).toBeNull();
    });

    it('returns discounted amount when family discount applies', async () => {
      const playerId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
      const siblingId = 'dddddddddddddddddddddddd';

      mockPlayerModel.findById.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(makePlayer({ category: CategoryEnum.M15 })) });
      mockConfigModel.findOne.mockReturnValue(lean(makeConfig({ familyDiscount: true })));
      mockFamilyGroupModel.findOne.mockResolvedValue({
        members: [
          { playerId: oid(siblingId), order: 1 },
          { playerId: oid(playerId), order: 2 },
        ],
      });
      mockPlayerModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { _id: oid(siblingId), category: CategoryEnum.PLANTEL_SUPERIOR }, // 10000
          { _id: oid(playerId), category: CategoryEnum.M15 },               // 7000 — cheaper
        ]),
      });

      const result = await service.previewManualPayment(playerId, '2025', SportEnum.RUGBY);
      expect(result.discountPct).toBe(25);
      expect(result.finalAmount).toBe(5250); // 7000 * 0.75
    });
  });

  // ── recordManualPayment ──────────────────────────────────────────────────

  describe('recordManualPayment()', () => {
    const dto = {
      playerId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      season: '2025',
      sport: SportEnum.RUGBY,
      method: PaymentMethodEnum.CASH,
    };

    beforeEach(() => {
      mockPaymentModel.findOne.mockResolvedValue(null); // no existing
      mockPlayerModel.findById.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(makePlayer()) });
      mockConfigModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(makeConfig()) });
      mockPaymentModel.create.mockResolvedValue(makePayment({ id: 'cccccccccccccccccccccccc', finalAmount: 10000 }));
      mockGeneralPaymentModel.create.mockResolvedValue({});
    });

    it('creates a payment record with correct amount', async () => {
      await service.recordManualPayment(dto);
      expect(mockPaymentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          originalAmount: 10000,
          finalAmount: 10000,
          status: PlayerFeeStatusEnum.APPROVED,
          paymentMethod: PaymentMethodEnum.CASH,
        })
      );
    });

    it('throws ConflictException when payment already exists', async () => {
      mockPaymentModel.findOne.mockResolvedValue(makePayment());
      await expect(service.recordManualPayment(dto)).rejects.toThrow();
    });

    it('creates a general payment record after saving fee payment', async () => {
      await service.recordManualPayment(dto);
      expect(mockGeneralPaymentModel.create).toHaveBeenCalled();
    });
  });
});
