import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TrainingSessionsService } from './training-sessions.service';
import { TrainingSessionEntity } from './schemas/training-session.entity';
import { TrainingScheduleEntity } from '../schedules/schemas/training-schedule.entity';
import { PlayerEntity } from '../../players/schemas/player.entity';
import { User } from '../../users/schemas/user.schema';
import { MatchEntity } from '../../matches/schemas/match.entity';
import { RoleEnum, TrainingSessionStatusEnum } from '@ltrc-campo/shared-api-model';

// ── helpers ───────────────────────────────────────────────────────────────────

const oid = (s = 'aaaaaaaaaaaaaaaaaaaaaaaa') => new Types.ObjectId(s);

const makeSession = (overrides: any = {}) => ({
  _id: oid(),
  id: 'session-1',
  date: '2025-06-15',
  startTime: '18:00',
  endTime: '19:30',
  sport: 'rugby',
  category: 'plantel_superior',
  status: TrainingSessionStatusEnum.SCHEDULED,
  attendance: [],
  save: jest.fn().mockResolvedValue(undefined),
  deleteOne: jest.fn().mockResolvedValue(undefined),
  populate: jest.fn().mockResolvedValue(undefined),
  set: jest.fn(),
  ...overrides,
});

const makePlayer = (overrides: any = {}) => ({
  _id: oid('bbbbbbbbbbbbbbbbbbbbbbbb'),
  name: 'Juan Pérez',
  sport: 'rugby',
  category: 'plantel_superior',
  ...overrides,
});

const makeUser = (roles: RoleEnum[] = [RoleEnum.PLAYER], overrides: any = {}): Partial<User> => ({
  _id: oid('cccccccccccccccccccccccc') as any,
  name: 'Juan Pérez',
  roles,
  sports: [],
  categories: [],
  ...overrides,
});

// ── mock models ───────────────────────────────────────────────────────────────

const mockSessionModel = {
  create: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
  populate: jest.fn().mockResolvedValue([]),
};
const mockScheduleModel = { findById: jest.fn(), find: jest.fn() };
const mockPlayerModel = { findOne: jest.fn(), find: jest.fn() };
const mockUserModel = { findOne: jest.fn() };
const mockMatchModel = { find: jest.fn(), findById: jest.fn() };

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-token'),
  verify: jest.fn(),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('TrainingSessionsService', () => {
  let service: TrainingSessionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingSessionsService,
        { provide: getModelToken(TrainingSessionEntity.name), useValue: mockSessionModel },
        { provide: getModelToken(TrainingScheduleEntity.name), useValue: mockScheduleModel },
        { provide: getModelToken(PlayerEntity.name), useValue: mockPlayerModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(MatchEntity.name), useValue: mockMatchModel },
        { provide: JwtService, useValue: mockJwtService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => def ?? undefined),
          },
        },
      ],
    }).compile();

    service = module.get(TrainingSessionsService);
  });

  it('should be defined', () => expect(service).toBeDefined());

  // ── create ────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should create a session', async () => {
      const dto = { date: '2025-06-15', sport: 'rugby', category: 'plantel_superior', startTime: '18:00' } as any;
      const created = makeSession();
      mockSessionModel.create.mockResolvedValue(created);

      const result = await service.create(dto);
      expect(mockSessionModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ date: '2025-06-15', sport: 'rugby' })
      );
      expect(result).toBe(created);
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return populated session', async () => {
      const session = makeSession();
      mockSessionModel.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(session) });
      const result = await service.findOne('session-1');
      expect(result).toBe(session);
    });

    it('should throw NotFoundException when not found', async () => {
      mockSessionModel.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should update and save', async () => {
      const session = makeSession();
      mockSessionModel.findById.mockResolvedValue(session);

      await service.update('session-1', { location: 'Campo 1' } as any);
      expect(session.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when not found', async () => {
      mockSessionModel.findById.mockResolvedValue(null);
      await expect(service.update('bad-id', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should soft-detach from schedule when date changes', async () => {
      const session = makeSession({ date: '2025-06-15', schedule: oid() });
      mockSessionModel.findById.mockResolvedValue(session);
      mockSessionModel.findOneAndUpdate.mockResolvedValue(null);
      mockSessionModel.findByIdAndUpdate.mockResolvedValue(null);

      await service.update('session-1', { date: '2025-06-20' } as any);

      expect(mockSessionModel.findOneAndUpdate).toHaveBeenCalled();
      expect(mockSessionModel.findByIdAndUpdate).toHaveBeenCalled();
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('should hard-delete when session has no schedule', async () => {
      const session = makeSession({ schedule: undefined });
      mockSessionModel.findById.mockResolvedValue(session);
      await service.delete('session-1');
      expect(session.deleteOne).toHaveBeenCalled();
    });

    it('should soft-delete (CANCELLED) when session is linked to a schedule', async () => {
      const session = makeSession({ schedule: oid() });
      mockSessionModel.findById.mockResolvedValue(session);
      await service.delete('session-1');
      expect(session.status).toBe(TrainingSessionStatusEnum.CANCELLED);
      expect(session.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when not found', async () => {
      mockSessionModel.findById.mockResolvedValue(null);
      await expect(service.delete('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── generateCheckinToken ──────────────────────────────────────────────────

  describe('generateCheckinToken()', () => {
    it('should generate a token with validFrom and validUntil', async () => {
      const session = makeSession({ startTime: '18:00' });
      mockSessionModel.findById.mockResolvedValue(session);

      const result = await service.generateCheckinToken('session-1');
      expect(result.token).toBe('mock-token');
      expect(result.validFrom).toBeDefined();
      expect(result.validUntil).toBeDefined();
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'session-1', type: 'checkin' }),
        expect.any(Object)
      );
    });

    it('should throw NotFoundException when session not found', async () => {
      mockSessionModel.findById.mockResolvedValue(null);
      await expect(service.generateCheckinToken('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── checkin ───────────────────────────────────────────────────────────────

  describe('checkin()', () => {
    const validPayload = {
      sub: 'session-1',
      type: 'checkin',
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      validUntil: new Date(Date.now() + 60_000).toISOString(),
    };
    const caller = makeUser([RoleEnum.PLAYER]) as User;
    const player = makePlayer({ userId: caller._id!.toString() });

    it('should mark attendance as present', async () => {
      mockJwtService.verify.mockReturnValue(validPayload);
      const session = makeSession({ attendance: [] });
      mockSessionModel.findById.mockResolvedValue(session);
      mockPlayerModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(player) });

      await service.checkin('session-1', 'valid-token', caller);
      expect(session.attendance).toHaveLength(1);
      expect(session.attendance[0].status).toBe('present');
      expect(session.save).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on invalid token', async () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('invalid'); });
      await expect(service.checkin('session-1', 'bad-token', caller)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException when token is for different session', async () => {
      mockJwtService.verify.mockReturnValue({ ...validPayload, sub: 'other-session' });
      await expect(service.checkin('session-1', 'token', caller)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException when QR not yet active', async () => {
      mockJwtService.verify.mockReturnValue({
        ...validPayload,
        validFrom: new Date(Date.now() + 60_000).toISOString(),
      });
      await expect(service.checkin('session-1', 'token', caller)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no linked player', async () => {
      mockJwtService.verify.mockReturnValue(validPayload);
      mockSessionModel.findById.mockResolvedValue(makeSession());
      mockPlayerModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.checkin('session-1', 'token', caller)).rejects.toThrow(BadRequestException);
    });
  });

  // ── confirmAttendance ─────────────────────────────────────────────────────

  describe('confirmAttendance()', () => {
    const player = makePlayer();
    const callerAsPlayer = makeUser([RoleEnum.PLAYER]) as User;
    const callerNoRole = makeUser([RoleEnum.ADMIN]) as User;

    it('should add new confirmation entry for player', async () => {
      const session = makeSession({ attendance: [] });
      mockSessionModel.findById.mockResolvedValue(session);
      mockPlayerModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(player) });

      await service.confirmAttendance('session-1', callerAsPlayer);

      expect(session.attendance).toHaveLength(1);
      expect(session.attendance[0].confirmed).toBe(true);
      expect(session.save).toHaveBeenCalled();
    });

    it('should update existing entry to confirmed', async () => {
      const existing = { player: player._id, confirmed: false, confirmedAt: undefined, isStaff: false };
      const session = makeSession({ attendance: [existing] });
      mockSessionModel.findById.mockResolvedValue(session);
      mockPlayerModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(player) });

      await service.confirmAttendance('session-1', callerAsPlayer);

      expect(existing.confirmed).toBe(true);
    });

    it('should throw BadRequestException when caller has no field role', async () => {
      mockSessionModel.findById.mockResolvedValue(makeSession());
      await expect(service.confirmAttendance('session-1', callerNoRole)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when session not found', async () => {
      mockSessionModel.findById.mockResolvedValue(null);
      await expect(service.confirmAttendance('bad-id', callerAsPlayer)).rejects.toThrow(NotFoundException);
    });
  });

  // ── cancelConfirmation ────────────────────────────────────────────────────

  describe('cancelConfirmation()', () => {
    it('should set confirmed=false on existing entry', async () => {
      const player = makePlayer();
      const entry = { player: player._id, confirmed: true, confirmedAt: new Date(), isStaff: false };
      const session = makeSession({ attendance: [entry] });
      mockSessionModel.findById.mockResolvedValue(session);
      mockPlayerModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(player) });

      await service.cancelConfirmation('session-1', makeUser([RoleEnum.PLAYER]) as User);

      expect(entry.confirmed).toBe(false);
      expect(entry.confirmedAt).toBeUndefined();
    });

    it('should throw NotFoundException when session not found', async () => {
      mockSessionModel.findById.mockResolvedValue(null);
      await expect(service.cancelConfirmation('bad-id', makeUser() as User)).rejects.toThrow(NotFoundException);
    });
  });

  // ── recordAttendance ──────────────────────────────────────────────────────

  describe('recordAttendance()', () => {
    it('should add attendance record for player', async () => {
      const session = makeSession({ attendance: [] });
      mockSessionModel.findById.mockResolvedValue(session);

      await service.recordAttendance('session-1', {
        records: [{ playerId: oid().toString(), status: 'present', isStaff: false }],
      } as any, 'caller-id');

      expect(session.attendance).toHaveLength(1);
      expect(session.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when session not found', async () => {
      mockSessionModel.findById.mockResolvedValue(null);
      await expect(service.recordAttendance('bad-id', { records: [] } as any, 'id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findPaginated ─────────────────────────────────────────────────────────

  describe('findPaginated()', () => {
    beforeEach(() => {
      mockSessionModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      mockSessionModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
      mockPlayerModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    });

    it('returns paginated result', async () => {
      const result = await service.findPaginated({ page: 1, size: 10, filters: {} } as any);
      expect(result).toMatchObject({ items: [], total: 0, page: 1, size: 10 });
    });

    it('applies sport, category and status filters (with sortBy → uses find)', async () => {
      await service.findPaginated({ page: 1, size: 10, sortBy: 'date', filters: { sport: 'rugby', category: 'plantel_superior', status: 'scheduled' } } as any);
      expect(mockSessionModel.find).toHaveBeenCalledWith(expect.objectContaining({ sport: 'rugby', category: 'plantel_superior', status: 'scheduled' }));
    });

    it('applies date range filters (with sortBy → uses find)', async () => {
      await service.findPaginated({ page: 1, size: 10, sortBy: 'date', filters: { fromDate: '2025-01-01', toDate: '2025-06-30' } } as any);
      expect(mockSessionModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ date: { $gte: '2025-01-01', $lte: '2025-06-30' } })
      );
    });

    it('applies scope filter for non-admin caller with sports (with sortBy → uses find)', async () => {
      const caller = makeUser([RoleEnum.COACH]) as User;
      (caller as any).sports = ['rugby'];
      (caller as any).categories = ['plantel_superior'];

      await service.findPaginated({ page: 1, size: 10, sortBy: 'date', filters: {} } as any, caller);
      expect(mockSessionModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ sport: { $in: ['rugby'] } })
      );
    });
  });

  // ── getUpcomingForUser ────────────────────────────────────────────────────

  describe('getUpcomingForUser()', () => {
    it('returns upcoming sessions for user', async () => {
      const caller = makeUser([RoleEnum.PLAYER]) as User;
      const session = makeSession({ attendance: [] });
      mockPlayerModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(makePlayer()) });
      mockSessionModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([session]),
      });

      const result = await service.getUpcomingForUser(caller, 7, '2025-06-01');
      expect(result).toHaveLength(1);
      expect(result[0].sessionId).toBeDefined();
    });

    it('returns empty array when no sessions', async () => {
      const caller = makeUser([RoleEnum.ADMIN]) as User;
      mockPlayerModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockSessionModel.find.mockReturnValue({ sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) });
      const result = await service.getUpcomingForUser(caller, 7, '2025-06-01');
      expect(result).toHaveLength(0);
    });
  });

  // ── getAttendanceStats ────────────────────────────────────────────────────

  describe('getAttendanceStats()', () => {
    it('returns stats grouped by category', async () => {
      const sessions = [
        { category: 'plantel_superior', attendance: [{ isStaff: false, status: 'present' }, { isStaff: false, status: 'absent' }] },
        { category: 'plantel_superior', attendance: [{ isStaff: false, status: 'present' }] },
      ];
      mockSessionModel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(sessions) });

      const result = await service.getAttendanceStats();
      expect(result.byCategory['plantel_superior'].sessions).toBe(2);
      expect(result.byCategory['plantel_superior'].totalAttendees).toBe(3);
      expect(result.byCategory['plantel_superior'].totalPresent).toBe(2);
      expect(result.byCategory['plantel_superior'].pct).toBeCloseTo(67);
    });

    it('returns pct=0 when no attendees', async () => {
      mockSessionModel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([{ category: 'm8', attendance: [] }]) });
      const result = await service.getAttendanceStats();
      expect(result.byCategory['m8'].pct).toBe(0);
    });

    it('applies sport filter from params', async () => {
      mockSessionModel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      await service.getAttendanceStats(undefined, { sport: 'rugby' });
      expect(mockSessionModel.find).toHaveBeenCalledWith(expect.objectContaining({ sport: 'rugby' }));
    });

    it('applies caller scope for non-admin', async () => {
      const caller = makeUser([RoleEnum.COACH]) as User;
      (caller as any).sports = ['rugby'];
      (caller as any).categories = [];
      mockSessionModel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      await service.getAttendanceStats(caller);
      expect(mockSessionModel.find).toHaveBeenCalledWith(expect.objectContaining({ sport: { $in: ['rugby'] } }));
    });
  });

  // ── getStaffForSession ────────────────────────────────────────────────────

  describe('getStaffForSession()', () => {
    it('returns staff list for session', async () => {
      const session = makeSession({ sport: 'rugby', category: 'plantel_superior' });
      mockSessionModel.findById.mockResolvedValue(session);
      const users = [{ _id: oid(), name: 'Coach Pérez', roles: ['coach'] }];
      mockUserModel.findOne.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) });
      (mockUserModel as any).find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(users) });

      const result = await service.getStaffForSession('session-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Coach Pérez');
    });

    it('throws NotFoundException when session not found', async () => {
      mockSessionModel.findById.mockResolvedValue(null);
      await expect(service.getStaffForSession('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
