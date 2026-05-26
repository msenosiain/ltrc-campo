import { Test, TestingModule } from '@nestjs/testing';
import { TrainingSessionsController } from './training-sessions.controller';
import { TrainingSessionsService } from './training-sessions.service';
import { SportEnum, CategoryEnum } from '@ltrc-campo/shared-api-model';

const mockStatsResult = { byCategory: {} };

const mockService = {
  findPaginated: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, size: 10 }),
  create: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
  getUpcomingForUser: jest.fn().mockResolvedValue([]),
  confirmAttendance: jest.fn().mockResolvedValue({}),
  cancelConfirmation: jest.fn().mockResolvedValue({}),
  getStaffForSession: jest.fn().mockResolvedValue([]),
  recordAttendance: jest.fn().mockResolvedValue({}),
  getAttendanceStats: jest.fn().mockResolvedValue(mockStatsResult),
  addAttachment: jest.fn().mockResolvedValue({ fileId: 'fid', filename: 'f.pdf', mimeType: 'application/pdf' }),
  getAttachmentStream: jest.fn(),
  updateAttachment: jest.fn().mockResolvedValue({ fileId: 'fid', name: 'updated' }),
  deleteAttachment: jest.fn().mockResolvedValue(undefined),
};

describe('TrainingSessionsController', () => {
  let controller: TrainingSessionsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainingSessionsController],
      providers: [{ provide: TrainingSessionsService, useValue: mockService }],
    }).compile();

    controller = module.get(TrainingSessionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAttendanceStats()', () => {
    it('should call service with user and no filters when no query params', async () => {
      const mockReq = { user: { _id: 'user-1', roles: [] } } as any;

      const result = await controller.getAttendanceStats(mockReq, undefined, undefined);

      expect(mockService.getAttendanceStats).toHaveBeenCalledWith(
        mockReq.user,
        { sport: undefined, category: undefined }
      );
      expect(result).toEqual(mockStatsResult);
    });

    it('should pass sport query param to service', async () => {
      const mockReq = { user: { _id: 'user-1', roles: [] } } as any;

      await controller.getAttendanceStats(mockReq, SportEnum.RUGBY, undefined);

      expect(mockService.getAttendanceStats).toHaveBeenCalledWith(
        mockReq.user,
        { sport: SportEnum.RUGBY, category: undefined }
      );
    });

    it('should pass category query param to service', async () => {
      const mockReq = { user: { _id: 'user-1', roles: [] } } as any;

      await controller.getAttendanceStats(mockReq, undefined, CategoryEnum.PLANTEL_SUPERIOR);

      expect(mockService.getAttendanceStats).toHaveBeenCalledWith(
        mockReq.user,
        { sport: undefined, category: CategoryEnum.PLANTEL_SUPERIOR }
      );
    });

    it('should pass both sport and category query params to service', async () => {
      const mockReq = { user: { _id: 'user-1', roles: [] } } as any;

      await controller.getAttendanceStats(mockReq, SportEnum.HOCKEY, CategoryEnum.QUINTA);

      expect(mockService.getAttendanceStats).toHaveBeenCalledWith(
        mockReq.user,
        { sport: SportEnum.HOCKEY, category: CategoryEnum.QUINTA }
      );
    });
  });

  // ── attachment endpoints ──────────────────────────────────────────────────

  describe('addAttachment()', () => {
    it('should call service with parsed targetPlayers and return attachment', async () => {
      const file = { originalname: 'plan.pdf', buffer: Buffer.from('x'), mimetype: 'application/pdf' } as any;
      const playerIds = ['aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb'];

      const result = await controller.addAttachment('session-1', file, 'Plan', 'players', JSON.stringify(playerIds));

      expect(mockService.addAttachment).toHaveBeenCalledWith('session-1', file, 'Plan', 'players', playerIds);
      expect(result).toMatchObject({ fileId: 'fid' });
    });

    it('should handle array targetPlayers without parsing', async () => {
      const file = { originalname: 'f.pdf', buffer: Buffer.from('x'), mimetype: 'application/pdf' } as any;
      const playerIds = ['aaa', 'bbb'];

      await controller.addAttachment('session-1', file, undefined, 'all', playerIds);

      expect(mockService.addAttachment).toHaveBeenCalledWith('session-1', file, undefined, 'all', playerIds);
    });

    it('should pass undefined targetPlayers when not provided', async () => {
      const file = { originalname: 'f.pdf', buffer: Buffer.from('x'), mimetype: 'application/pdf' } as any;

      await controller.addAttachment('session-1', file, 'Doc', 'staff', undefined);

      expect(mockService.addAttachment).toHaveBeenCalledWith('session-1', file, 'Doc', 'staff', undefined);
    });
  });

  describe('getAttachment()', () => {
    it('should pipe stream to response with correct headers', async () => {
      const fakeStream = { pipe: jest.fn() };
      mockService.getAttachmentStream.mockResolvedValue({
        stream: fakeStream,
        mimeType: 'application/pdf',
        filename: 'plan.pdf',
      });
      const res = { setHeader: jest.fn() } as any;

      await controller.getAttachment('session-1', 'fid', res);

      expect(mockService.getAttachmentStream).toHaveBeenCalledWith('session-1', 'fid');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('plan.pdf'));
      expect(fakeStream.pipe).toHaveBeenCalledWith(res);
    });
  });

  describe('updateAttachment()', () => {
    it('should call service and return updated attachment', async () => {
      const playerIds = ['aaa'];
      const result = await controller.updateAttachment('session-1', 'fid', 'Nuevo', 'staff', playerIds);

      expect(mockService.updateAttachment).toHaveBeenCalledWith('session-1', 'fid', 'Nuevo', 'staff', playerIds);
      expect(result).toMatchObject({ name: 'updated' });
    });
  });

  describe('deleteAttachment()', () => {
    it('should call service deleteAttachment', async () => {
      await controller.deleteAttachment('session-1', 'fid');
      expect(mockService.deleteAttachment).toHaveBeenCalledWith('session-1', 'fid');
    });
  });
});
