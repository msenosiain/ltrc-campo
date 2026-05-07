import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TripsService } from './trips.service';
import { TripEntity } from './schemas/trip.entity';
import {
  TripParticipantStatusEnum,
  TripParticipantTypeEnum,
} from '@ltrc-campo/shared-api-model';

// ── helpers ───────────────────────────────────────────────────────────────────

const oid = (s = 'aaaaaaaaaaaaaaaaaaaaaaaa') => new Types.ObjectId(s);

const makeParticipant = (overrides: any = {}) => ({
  _id: oid('dddddddddddddddddddddddd'),
  type: TripParticipantTypeEnum.PLAYER,
  player: oid('eeeeeeeeeeeeeeeeeeeeeeee'),
  status: TripParticipantStatusEnum.PENDING,
  costAssigned: 500,
  payments: [],
  deleteOne: jest.fn(),
  ...overrides,
});

const makeTransport = (overrides: any = {}) => ({
  _id: oid('ffffffffffffffffffffffff'),
  name: 'Bus 1',
  type: 'bus',
  capacity: 40,
  deleteOne: jest.fn(),
  ...overrides,
});

const makeTrip = (overrides: any = {}) => {
  const participants: any[] = overrides.participants ?? [];
  const transports: any[] = overrides.transports ?? [];
  return {
    _id: oid(),
    id: 'trip-1',
    name: 'Viaje a Mendoza',
    destination: 'Mendoza',
    costPerPerson: 500,
    status: 'open',
    participants: Object.assign(participants, {
      id: (pid: string) => participants.find((p: any) => p._id.toString() === pid) ?? null,
    }),
    transports: Object.assign(transports, {
      id: (tid: string) => transports.find((t: any) => t._id.toString() === tid) ?? null,
    }),
    save: jest.fn().mockResolvedValue(undefined),
    deleteOne: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
};

// ── mock model ────────────────────────────────────────────────────────────────

const mockTripModel = {
  create: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('TripsService', () => {
  let service: TripsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: getModelToken(TripEntity.name), useValue: mockTripModel },
      ],
    }).compile();

    service = module.get(TripsService);
  });

  it('should be defined', () => expect(service).toBeDefined());

  // ── create ────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should create a trip with default status and costPerPerson', async () => {
      const dto = { name: 'Viaje a Córdoba', destination: 'Córdoba', departureDate: new Date() } as any;
      const created = makeTrip({ name: dto.name });
      mockTripModel.create.mockResolvedValue(created);

      const result = await service.create(dto);
      expect(mockTripModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ costPerPerson: 0, status: 'draft' })
      );
      expect(result).toBe(created);
    });
  });

  // ── findPaginated ─────────────────────────────────────────────────────────

  describe('findPaginated()', () => {
    beforeEach(() => {
      mockTripModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      mockTripModel.countDocuments.mockResolvedValue(0);
    });

    it('should return paginated result', async () => {
      const result = await service.findPaginated({ page: 1, size: 10, filters: {} } as any);
      expect(result).toMatchObject({ items: [], total: 0, page: 1, size: 10 });
    });

    it('should apply sport and status filters', async () => {
      await service.findPaginated({ page: 1, size: 10, filters: { sport: 'rugby', status: 'open' } } as any);
      expect(mockTripModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ sport: 'rugby', status: 'open' })
      );
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return populated trip', async () => {
      const trip = makeTrip();
      mockTripModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(trip),
      });
      const result = await service.findOne('trip-1');
      expect(result).toBe(trip);
    });

    it('should throw NotFoundException when not found', async () => {
      mockTripModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should update fields and save', async () => {
      const trip = makeTrip();
      mockTripModel.findById.mockResolvedValue(trip);
      await service.update('trip-1', { name: 'Nuevo nombre' } as any);
      expect(trip.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when trip not found', async () => {
      mockTripModel.findById.mockResolvedValue(null);
      await expect(service.update('bad-id', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('should delete the trip', async () => {
      const trip = makeTrip();
      mockTripModel.findById.mockResolvedValue(trip);
      await service.delete('trip-1');
      expect(trip.deleteOne).toHaveBeenCalled();
    });

    it('should throw NotFoundException when not found', async () => {
      mockTripModel.findById.mockResolvedValue(null);
      await expect(service.delete('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── addParticipant ────────────────────────────────────────────────────────

  describe('addParticipant()', () => {
    const populatedTrip = makeTrip();
    const populatedMock = { populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(populatedTrip) };

    it('should add a player participant', async () => {
      mockTripModel.findById
        .mockResolvedValueOnce(makeTrip())
        .mockReturnValue(populatedMock);
      const result = await service.addParticipant('trip-1', {
        type: TripParticipantTypeEnum.PLAYER,
        playerId: 'eeeeeeeeeeeeeeeeeeeeeeee',
      } as any);
      expect(result).toBe(populatedTrip);
    });

    it('should throw BadRequestException when playerId is missing', async () => {
      mockTripModel.findById.mockResolvedValueOnce(makeTrip());
      await expect(
        service.addParticipant('trip-1', { type: TripParticipantTypeEnum.PLAYER } as any)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when player already in trip', async () => {
      const playerId = 'eeeeeeeeeeeeeeeeeeeeeeee';
      const tripWithPlayer = makeTrip({
        participants: [makeParticipant({ player: oid(playerId) })],
      });
      mockTripModel.findById.mockResolvedValueOnce(tripWithPlayer);
      await expect(
        service.addParticipant('trip-1', { type: TripParticipantTypeEnum.PLAYER, playerId } as any)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when externalName missing for external', async () => {
      mockTripModel.findById.mockResolvedValueOnce(makeTrip());
      await expect(
        service.addParticipant('trip-1', { type: TripParticipantTypeEnum.EXTERNAL } as any)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when trip not found', async () => {
      mockTripModel.findById.mockResolvedValueOnce(null);
      await expect(
        service.addParticipant('trip-1', { type: TripParticipantTypeEnum.PLAYER, playerId: 'id' } as any)
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── bulkAddParticipants ───────────────────────────────────────────────────

  describe('bulkAddParticipants()', () => {
    it('should add new players and skip duplicates', async () => {
      const existingId = 'eeeeeeeeeeeeeeeeeeeeeeee';
      const trip = makeTrip({ participants: [makeParticipant({ player: oid(existingId) })] });
      const populated = makeTrip();
      mockTripModel.findById
        .mockResolvedValueOnce(trip)
        .mockReturnValue({ populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(populated) });

      await service.bulkAddParticipants('trip-1', [
        { type: TripParticipantTypeEnum.PLAYER, playerId: existingId } as any,
        { type: TripParticipantTypeEnum.PLAYER, playerId: 'ffffffffffffffffffffffff' } as any,
      ]);

      expect(trip.participants).toHaveLength(2); // 1 original + 1 new
      expect(trip.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when trip not found', async () => {
      mockTripModel.findById.mockResolvedValueOnce(null);
      await expect(service.bulkAddParticipants('bad-id', [])).rejects.toThrow(NotFoundException);
    });
  });

  // ── removeAllParticipants ─────────────────────────────────────────────────

  describe('removeAllParticipants()', () => {
    it('should clear participants and save', async () => {
      const trip = makeTrip({ participants: [makeParticipant()] });
      const populated = makeTrip();
      mockTripModel.findById
        .mockResolvedValueOnce(trip)
        .mockReturnValue({ populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(populated) });

      await service.removeAllParticipants('trip-1');
      expect(trip.save).toHaveBeenCalled();
    });
  });

  // ── updateParticipant ─────────────────────────────────────────────────────

  describe('updateParticipant()', () => {
    it('should update participant fields', async () => {
      const participant = makeParticipant();
      const trip = makeTrip({ participants: [participant] });
      const populated = makeTrip();
      mockTripModel.findById
        .mockResolvedValueOnce(trip)
        .mockReturnValue({ populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(populated) });

      await service.updateParticipant('trip-1', participant._id.toString(), {
        status: TripParticipantStatusEnum.CONFIRMED,
        costAssigned: 600,
      } as any);

      expect(participant.status).toBe(TripParticipantStatusEnum.CONFIRMED);
      expect(participant.costAssigned).toBe(600);
      expect(trip.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when participant not found', async () => {
      mockTripModel.findById.mockResolvedValueOnce(makeTrip({ participants: [] }));
      await expect(service.updateParticipant('trip-1', 'bad-pid', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ── removeParticipant ─────────────────────────────────────────────────────

  describe('removeParticipant()', () => {
    it('should delete participant and save', async () => {
      const participant = makeParticipant();
      const trip = makeTrip({ participants: [participant] });
      const populated = makeTrip();
      mockTripModel.findById
        .mockResolvedValueOnce(trip)
        .mockReturnValue({ populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(populated) });

      await service.removeParticipant('trip-1', participant._id.toString());
      expect(participant.deleteOne).toHaveBeenCalled();
      expect(trip.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when participant not found', async () => {
      mockTripModel.findById.mockResolvedValueOnce(makeTrip({ participants: [] }));
      await expect(service.removeParticipant('trip-1', 'bad-pid')).rejects.toThrow(NotFoundException);
    });
  });

  // ── recordPayment ─────────────────────────────────────────────────────────

  describe('recordPayment()', () => {
    it('should add payment and auto-confirm when total reaches costAssigned', async () => {
      const participant = makeParticipant({ payments: [], costAssigned: 500, status: TripParticipantStatusEnum.PENDING });
      const trip = makeTrip({ participants: [participant] });
      const populated = makeTrip();
      mockTripModel.findById
        .mockResolvedValueOnce(trip)
        .mockReturnValue({ populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(populated) });

      await service.recordPayment('trip-1', participant._id.toString(), {
        amount: 500,
        date: new Date().toISOString(),
      } as any);

      expect(participant.payments).toHaveLength(1);
      expect(participant.status).toBe(TripParticipantStatusEnum.CONFIRMED);
    });

    it('should not auto-confirm when total is below costAssigned', async () => {
      const participant = makeParticipant({ payments: [], costAssigned: 500, status: TripParticipantStatusEnum.PENDING });
      const trip = makeTrip({ participants: [participant] });
      const populated = makeTrip();
      mockTripModel.findById
        .mockResolvedValueOnce(trip)
        .mockReturnValue({ populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(populated) });

      await service.recordPayment('trip-1', participant._id.toString(), {
        amount: 200,
        date: new Date().toISOString(),
      } as any);

      expect(participant.status).toBe(TripParticipantStatusEnum.PENDING);
    });

    it('should throw NotFoundException when trip not found', async () => {
      mockTripModel.findById.mockResolvedValueOnce(null);
      await expect(service.recordPayment('bad', 'pid', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when participant not found', async () => {
      mockTripModel.findById.mockResolvedValueOnce(makeTrip({ participants: [] }));
      await expect(service.recordPayment('trip-1', 'bad-pid', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ── removePayment ─────────────────────────────────────────────────────────

  describe('removePayment()', () => {
    it('should remove payment and revert status to PENDING when total drops below costAssigned', async () => {
      const payments: any[] = [];
      const paymentEntry = {
        _id: oid('cccccccccccccccccccccccc'),
        amount: 500,
        deleteOne: jest.fn().mockImplementation(() => {
          const idx = payments.indexOf(paymentEntry);
          if (idx !== -1) payments.splice(idx, 1);
        }),
      };
      payments.push(paymentEntry);
      Object.assign(payments, {
        id: (pid: string) => payments.find((p: any) => p._id.toString() === pid) ?? null,
      });
      const participant = makeParticipant({ payments, costAssigned: 500, status: TripParticipantStatusEnum.CONFIRMED });
      const trip = makeTrip({ participants: [participant] });
      const populated = makeTrip();
      mockTripModel.findById
        .mockResolvedValueOnce(trip)
        .mockReturnValue({ populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(populated) });

      await service.removePayment('trip-1', participant._id.toString(), paymentEntry._id.toString());

      expect(paymentEntry.deleteOne).toHaveBeenCalled();
      expect(participant.status).toBe(TripParticipantStatusEnum.PENDING);
    });

    it('should throw NotFoundException when payment not found', async () => {
      const participant = makeParticipant({ payments: Object.assign([], { id: () => null }) });
      mockTripModel.findById.mockResolvedValueOnce(makeTrip({ participants: [participant] }));
      await expect(
        service.removePayment('trip-1', participant._id.toString(), 'bad-payment-id')
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── addTransport ──────────────────────────────────────────────────────────

  describe('addTransport()', () => {
    it('should add transport and save', async () => {
      const trip = makeTrip();
      const populated = makeTrip();
      mockTripModel.findById
        .mockResolvedValueOnce(trip)
        .mockReturnValue({ populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(populated) });

      await service.addTransport('trip-1', { name: 'Bus 1', type: 'bus', capacity: 40 } as any);
      expect(trip.save).toHaveBeenCalled();
    });
  });

  // ── removeTransport ───────────────────────────────────────────────────────

  describe('removeTransport()', () => {
    it('should remove transport and clear participant assignments', async () => {
      const transport = makeTransport();
      const participant = makeParticipant({ transportId: transport._id, seatNumber: 5 });
      const trip = makeTrip({ participants: [participant], transports: [transport] });
      const populated = makeTrip();
      mockTripModel.findById
        .mockResolvedValueOnce(trip)
        .mockReturnValue({ populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(populated) });

      await service.removeTransport('trip-1', transport._id.toString());

      expect(transport.deleteOne).toHaveBeenCalled();
      expect(participant.transportId).toBeUndefined();
      expect(participant.seatNumber).toBeUndefined();
    });

    it('should throw NotFoundException when transport not found', async () => {
      mockTripModel.findById.mockResolvedValueOnce(makeTrip({ transports: [] }));
      await expect(service.removeTransport('trip-1', 'bad-tid')).rejects.toThrow(NotFoundException);
    });
  });

  // ── moveParticipant ───────────────────────────────────────────────────────

  describe('moveParticipant()', () => {
    it('should assign participant to transport', async () => {
      const transport = makeTransport();
      const participant = makeParticipant();
      const trip = makeTrip({ participants: [participant], transports: [transport] });
      const populated = makeTrip();
      mockTripModel.findById
        .mockResolvedValueOnce(trip)
        .mockReturnValue({ populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(populated) });

      await service.moveParticipant('trip-1', participant._id.toString(), {
        transportId: transport._id.toString(),
      } as any);

      expect(participant.transportId).toBeDefined();
      expect(trip.save).toHaveBeenCalled();
    });

    it('should unassign participant when transportId is null', async () => {
      const transport = makeTransport();
      const participant = makeParticipant({ transportId: transport._id, seatNumber: 3 });
      const trip = makeTrip({ participants: [participant], transports: [transport] });
      const populated = makeTrip();
      mockTripModel.findById
        .mockResolvedValueOnce(trip)
        .mockReturnValue({ populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(populated) });

      await service.moveParticipant('trip-1', participant._id.toString(), { transportId: null } as any);

      expect(participant.transportId).toBeUndefined();
      expect(participant.seatNumber).toBeUndefined();
    });

    it('should throw NotFoundException when transport not found', async () => {
      const participant = makeParticipant();
      const trip = makeTrip({ participants: [participant], transports: [] });
      mockTripModel.findById.mockResolvedValueOnce(trip);
      await expect(
        service.moveParticipant('trip-1', participant._id.toString(), { transportId: 'bad-tid' } as any)
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── bulkUpdateStatus ──────────────────────────────────────────────────────

  describe('bulkUpdateStatus()', () => {
    it('should update status for each participant id', async () => {
      const p1 = makeParticipant();
      const p2 = makeParticipant({ _id: oid('ddddddddddddddddddddddde') });
      const idFn = (pid: string) => [p1, p2].find((p: any) => p._id.toString() === pid) ?? null;
      const participants = Object.assign([p1, p2], { id: idFn });
      const trip = makeTrip({ participants });
      const populated = makeTrip();
      mockTripModel.findById
        .mockResolvedValueOnce(trip)
        .mockReturnValue({ populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(populated) });

      await service.bulkUpdateStatus('trip-1', [p1._id.toString()], TripParticipantStatusEnum.CONFIRMED);
      expect(p1.status).toBe(TripParticipantStatusEnum.CONFIRMED);
      expect(trip.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when trip not found', async () => {
      mockTripModel.findById.mockResolvedValueOnce(null);
      await expect(service.bulkUpdateStatus('bad-id', [], TripParticipantStatusEnum.CONFIRMED)).rejects.toThrow(NotFoundException);
    });
  });

  // ── getPublicTripInfo ─────────────────────────────────────────────────────

  describe('getPublicTripInfo()', () => {
    it('should return trip public info', async () => {
      const tripData = { name: 'Viaje a Mendoza', destination: 'Mendoza', departureDate: new Date('2025-06-01'), returnDate: null };
      mockTripModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(tripData),
      });
      const result = await service.getPublicTripInfo('trip-1');
      expect(result.name).toBe('Viaje a Mendoza');
      expect(result.destination).toBe('Mendoza');
    });

    it('should throw NotFoundException when trip not found', async () => {
      mockTripModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.getPublicTripInfo('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── lookupAuthorizationByDni ──────────────────────────────────────────────

  describe('lookupAuthorizationByDni()', () => {
    it('should return passenger info when DNI matches a player', async () => {
      const player = { name: 'Juan Pérez', idNumber: '12345678' };
      const tripData = {
        name: 'Viaje a Córdoba',
        destination: 'Córdoba',
        departureDate: new Date('2025-06-01'),
        returnDate: null,
        transports: [],
        participants: [{ player, externalDni: undefined, externalName: undefined, transportId: undefined }],
      };
      mockTripModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(tripData),
      });

      const result = await service.lookupAuthorizationByDni('trip-1', '12345678');
      expect(result.passengerName).toBe('Juan Pérez');
      expect(result.tripName).toBe('Viaje a Córdoba');
    });

    it('should throw NotFoundException when participant not found', async () => {
      const tripData = { name: 'Viaje', destination: 'X', departureDate: new Date(), returnDate: null, transports: [], participants: [] };
      mockTripModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(tripData),
      });
      await expect(service.lookupAuthorizationByDni('trip-1', '99999999')).rejects.toThrow(NotFoundException);
    });
  });
});
