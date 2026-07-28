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
import { GridFsService } from '../../shared/gridfs/gridfs.service';
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
  attachments: [],
  save: jest.fn().mockResolvedValue(undefined),
  deleteOne: jest.fn().mockResolvedValue(undefined),
  populate: jest.fn().mockResolvedValue(undefined),
  markModified: jest.fn(),
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

const mockGridFsService = {
  uploadFile: jest.fn(),
  getFileStream: jest.fn(),
  deleteFile: jest.fn(),
};

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
        { provide: GridFsService, useValue: mockGridFsService },
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

  // ── getAttendanceReport ───────────────────────────────────────────────────

  describe('getAttendanceReport()', () => {
    const player1 = makePlayer({
      _id: oid('1'.repeat(24)),
      name: 'Ana',
      sport: 'rugby',
      category: 'plantel_superior',
    });

    const mockPlayersFind = (players: any[]) => {
      mockPlayerModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(players),
      });
    };
    const mockSessionsFind = (sessions: any[]) => {
      mockSessionModel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(sessions) });
    };
    const mockMatchesFind = (matches: any[]) => {
      mockMatchModel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(matches) });
    };

    const baseFilters = {
      sport: 'rugby',
      category: 'plantel_superior',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
    };

    it('counts a session with no attendance entry as absent', async () => {
      mockPlayersFind([player1]);
      mockSessionsFind([makeSession({ attendance: [] })]);
      mockMatchesFind([]);

      const result = await service.getAttendanceReport(undefined, { ...baseFilters, type: 'training' });

      expect(result.players).toHaveLength(1);
      expect(result.players[0].training).toEqual({ total: 1, present: 0, absent: 1, justified: 0, pct: 0 });
    });

    it('counts a marked-but-unset-status entry as absent, not present', async () => {
      mockPlayersFind([player1]);
      mockSessionsFind([
        makeSession({ attendance: [{ isStaff: false, player: player1._id, confirmed: false }] }),
      ]);
      mockMatchesFind([]);

      const result = await service.getAttendanceReport(undefined, { ...baseFilters, type: 'training' });

      expect(result.players[0].training).toEqual({ total: 1, present: 0, absent: 1, justified: 0, pct: 0 });
    });

    it('counts present and justified entries correctly', async () => {
      mockPlayersFind([player1]);
      mockSessionsFind([
        makeSession({ attendance: [{ isStaff: false, player: player1._id, status: 'present' }] }),
        makeSession({ attendance: [{ isStaff: false, player: player1._id, status: 'justified' }] }),
      ]);
      mockMatchesFind([]);

      const result = await service.getAttendanceReport(undefined, { ...baseFilters, type: 'training' });

      expect(result.players[0].training).toEqual({ total: 2, present: 1, absent: 0, justified: 1, pct: 50 });
    });

    it('excludes cancelled sessions/matches from the query', async () => {
      mockPlayersFind([player1]);
      mockSessionsFind([]);
      mockMatchesFind([]);

      await service.getAttendanceReport(undefined, baseFilters);

      expect(mockSessionModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: { $ne: 'cancelled' } }),
      );
      expect(mockMatchModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: { $ne: 'cancelled' } }),
      );
    });

    it("only counts a session toward a player's total when it matches the player's own sport/category", async () => {
      mockPlayersFind([player1]);
      mockSessionsFind([
        makeSession({ category: 'plantel_superior', attendance: [] }),
        makeSession({ category: 'm15', attendance: [] }), // different category — shouldn't count for player1
      ]);
      mockMatchesFind([]);

      const result = await service.getAttendanceReport(undefined, { ...baseFilters, category: undefined, type: 'training' });

      expect(result.players[0].training.total).toBe(1);
    });

    it('type="match" skips the training-sessions query entirely', async () => {
      mockPlayersFind([player1]);
      mockMatchesFind([]);

      await service.getAttendanceReport(undefined, { ...baseFilters, type: 'match' });

      expect(mockSessionModel.find).not.toHaveBeenCalled();
      expect(mockMatchModel.find).toHaveBeenCalled();
    });

    it('filters by a single playerId regardless of active status', async () => {
      mockPlayersFind([player1]);
      mockSessionsFind([]);
      mockMatchesFind([]);

      await service.getAttendanceReport(undefined, { ...baseFilters, playerId: player1._id.toString() });

      expect(mockPlayerModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ _id: player1._id.toString() }),
      );
      const calledQuery = mockPlayerModel.find.mock.calls[0][0];
      expect(calledQuery.status).toBeUndefined();
    });

    it('returns an empty result without querying players when no sport can be resolved', async () => {
      const caller = makeUser([RoleEnum.COACH]) as User;
      (caller as any).sports = [];
      (caller as any).categories = [];
      mockPlayerModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      const result = await service.getAttendanceReport(caller, { fromDate: '2026-01-01', toDate: '2026-01-31' });

      expect(result.players).toEqual([]);
      expect(mockPlayerModel.find).not.toHaveBeenCalled();
    });

    it('anchors the match date range to Argentina day boundaries', async () => {
      mockPlayersFind([player1]);
      mockSessionsFind([]);
      mockMatchesFind([]);

      await service.getAttendanceReport(undefined, baseFilters);

      const matchQuery = mockMatchModel.find.mock.calls[0][0];
      expect((matchQuery.date['$gte'] as Date).toISOString()).toBe('2026-01-01T03:00:00.000Z');
      expect((matchQuery.date['$lte'] as Date).toISOString()).toBe('2026-02-01T02:59:59.999Z');
    });
  });

  // ── addAttachment ─────────────────────────────────────────────────────────

  describe('addAttachment()', () => {
    const file = { originalname: 'plan.pdf', buffer: Buffer.from('x'), mimetype: 'application/pdf' } as any;

    it('should upload file to GridFS and push to session attachments', async () => {
      const session = makeSession({ attachments: [] });
      mockSessionModel.findById.mockResolvedValue(session);
      mockGridFsService.uploadFile.mockResolvedValue('file-id-1');

      const result = await service.addAttachment('session-1', file, 'Plan físico', 'all');

      expect(mockGridFsService.uploadFile).toHaveBeenCalledWith(
        'trainingAttachments',
        'plan.pdf',
        file.buffer,
        'application/pdf'
      );
      expect(session.attachments).toHaveLength(1);
      expect(session.attachments[0].fileId).toBe('file-id-1');
      expect(session.attachments[0].name).toBe('Plan físico');
      expect(session.save).toHaveBeenCalled();
      expect(result.fileId).toBe('file-id-1');
    });

    it('should store targetPlayers as ObjectIds when visibility is players', async () => {
      const session = makeSession({ attachments: [] });
      mockSessionModel.findById.mockResolvedValue(session);
      mockGridFsService.uploadFile.mockResolvedValue('file-id-2');
      const playerId = oid().toString();

      await service.addAttachment('session-1', file, 'Ejercicios', 'players', [playerId]);

      expect(session.attachments[0].targetPlayers).toHaveLength(1);
    });

    it('should throw NotFoundException when session not found', async () => {
      mockSessionModel.findById.mockResolvedValue(null);
      await expect(service.addAttachment('bad-id', file)).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateAttachment ──────────────────────────────────────────────────────

  describe('updateAttachment()', () => {
    it('should update name, visibility and targetPlayers', async () => {
      const att = { fileId: 'fid', filename: 'f.pdf', mimeType: 'application/pdf', name: 'old', visibility: 'all', targetPlayers: [] };
      const session = makeSession({ attachments: [att] });
      mockSessionModel.findById.mockResolvedValue(session);

      await service.updateAttachment('session-1', 'fid', 'Nuevo nombre', 'staff');

      expect(att.name).toBe('Nuevo nombre');
      expect(att.visibility).toBe('staff');
      expect(session.markModified).toHaveBeenCalledWith('attachments');
      expect(session.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when session not found', async () => {
      mockSessionModel.findById.mockResolvedValue(null);
      await expect(service.updateAttachment('bad-id', 'fid', 'n', 'all')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when attachment not found', async () => {
      const session = makeSession({ attachments: [] });
      mockSessionModel.findById.mockResolvedValue(session);
      await expect(service.updateAttachment('session-1', 'missing-fid', 'n', 'all')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getAttachmentStream ───────────────────────────────────────────────────

  describe('getAttachmentStream()', () => {
    it('should return stream, mimeType and filename', async () => {
      const att = { fileId: 'fid', filename: 'plan.pdf', mimeType: 'application/pdf' };
      const session = makeSession({ attachments: [att] });
      mockSessionModel.findById.mockResolvedValue(session);
      const fakeStream = {};
      mockGridFsService.getFileStream.mockReturnValue(fakeStream);

      const result = await service.getAttachmentStream('session-1', 'fid');

      expect(mockGridFsService.getFileStream).toHaveBeenCalledWith('trainingAttachments', 'fid');
      expect(result.stream).toBe(fakeStream);
      expect(result.mimeType).toBe('application/pdf');
      expect(result.filename).toBe('plan.pdf');
    });

    it('should throw NotFoundException when session not found', async () => {
      mockSessionModel.findById.mockResolvedValue(null);
      await expect(service.getAttachmentStream('bad-id', 'fid')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when attachment not found', async () => {
      const session = makeSession({ attachments: [] });
      mockSessionModel.findById.mockResolvedValue(session);
      await expect(service.getAttachmentStream('session-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── deleteAttachment ──────────────────────────────────────────────────────

  describe('deleteAttachment()', () => {
    it('should delete from GridFS and remove from attachments array', async () => {
      const att = { fileId: 'fid', filename: 'f.pdf', mimeType: 'application/pdf' };
      const session = makeSession({ attachments: [att] });
      mockSessionModel.findById.mockResolvedValue(session);
      mockGridFsService.deleteFile.mockResolvedValue(undefined);

      await service.deleteAttachment('session-1', 'fid');

      expect(mockGridFsService.deleteFile).toHaveBeenCalledWith('trainingAttachments', 'fid');
      expect(session.attachments).toHaveLength(0);
      expect(session.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when session not found', async () => {
      mockSessionModel.findById.mockResolvedValue(null);
      await expect(service.deleteAttachment('bad-id', 'fid')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when attachment not found', async () => {
      const session = makeSession({ attachments: [] });
      mockSessionModel.findById.mockResolvedValue(session);
      await expect(service.deleteAttachment('session-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('should delete GridFS file before removing from array (correct order)', async () => {
      const calls: string[] = [];
      const att = { fileId: 'fid', filename: 'f.pdf', mimeType: 'application/pdf' };
      const session = makeSession({ attachments: [att] });
      session.save = jest.fn().mockImplementation(() => { calls.push('save'); return Promise.resolve(); });
      mockSessionModel.findById.mockResolvedValue(session);
      mockGridFsService.deleteFile.mockImplementation(() => { calls.push('gridfs'); return Promise.resolve(); });

      await service.deleteAttachment('session-1', 'fid');

      expect(calls).toEqual(['gridfs', 'save']);
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
