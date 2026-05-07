import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchEntity } from './schemas/match.entity';
import { TournamentEntity } from '../tournaments/schemas/tournament.entity';
import { PlayerEntity } from '../players/schemas/player.entity';
import { SquadsService } from '../squads/squads.service';
import { GridFsService } from '../shared/gridfs/gridfs.service';
import { AttendanceStatusEnum, MatchStatusEnum, SortOrder } from '@ltrc-campo/shared-api-model';

const POPULATE_FIELDS = [
  'tournament',
  { path: 'squad.player' },
  { path: 'attendance.player' },
  { path: 'videos.targetPlayers' },
];

const mockMatch = {
  id: 'match-1',
  date: new Date('2026-03-07'),
  opponent: 'Rivadavia RC',
  venue: 'Cancha Marista',
  isHome: true,
  status: MatchStatusEnum.UPCOMING,
  category: 'plantel_superior',
  tournament: 'tournament-1',
  squad: [],
  attendance: [],
  save: jest.fn(),
  deleteOne: jest.fn(),
  set: jest.fn(),
  populate: jest.fn(),
};

const mockModel = {
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  countDocuments: jest.fn(),
  distinct: jest.fn(),
  aggregate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
  populate: jest.fn(),
};

const mockTournamentModel = {
  find: jest.fn(),
};

const mockPlayerModel = {};

const mockSquadsService = {
  getPlayers: jest.fn(),
};

const mockGridFsService = {
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
  getFileStream: jest.fn(),
};

describe('MatchesService', () => {
  let service: MatchesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: getModelToken(MatchEntity.name), useValue: mockModel },
        { provide: getModelToken(TournamentEntity.name), useValue: mockTournamentModel },
        { provide: getModelToken(PlayerEntity.name), useValue: mockPlayerModel },
        { provide: SquadsService, useValue: mockSquadsService },
        { provide: GridFsService, useValue: mockGridFsService },
      ],
    }).compile();

    service = module.get(MatchesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    it('should create a match', async () => {
      mockModel.create.mockResolvedValueOnce(mockMatch);
      const dto = {
        opponent: 'Rivadavia RC',
        venue: 'Cancha Marista',
        isHome: true,
        date: new Date(),
        category: 'plantel_superior',
        tournament: 'tournament-1',
      };

      const result = await service.create(dto as any);

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ opponent: dto.opponent, venue: dto.venue })
      );
      expect(result).toEqual(mockMatch);
    });
  });

  describe('update()', () => {
    it('should update a match', async () => {
      const match = {
        ...mockMatch,
        save: jest.fn().mockResolvedValue(mockMatch),
      };
      mockModel.findById.mockResolvedValueOnce(match);

      await service.update('match-1', { opponent: 'Los Pumas RC' });

      expect(match.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      await expect(service.update('bad-id', {})).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('updateSquad()', () => {
    it('should map playerId to player and update squad', async () => {
      const populated = { ...mockMatch };
      const match = {
        ...mockMatch,
        set: jest.fn(),
        save: jest.fn().mockResolvedValue({
          populate: jest.fn().mockResolvedValue(populated),
        }),
      };
      mockModel.findById.mockResolvedValueOnce(match);

      await service.updateSquad('match-1', [
        { shirtNumber: 1, playerId: 'player-id-1' },
        { shirtNumber: 2, playerId: 'player-id-2' },
      ]);

      expect(match.set).toHaveBeenCalledWith('squad', [
        { shirtNumber: 1, player: 'player-id-1' },
        { shirtNumber: 2, player: 'player-id-2' },
      ]);
    });

    it('should throw NotFoundException when not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      await expect(service.updateSquad('bad-id', [])).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('recordAttendance()', () => {
    it('should record player attendance', async () => {
      const match = {
        ...mockMatch,
        attendance: [],
        save: jest.fn().mockResolvedValue(mockMatch),
        populate: jest.fn().mockResolvedValue(mockMatch),
      };
      mockModel.findById.mockResolvedValueOnce(match);

      await service.recordAttendance(
        'match-1',
        {
          records: [
            { playerId: 'player-1', isStaff: false, status: AttendanceStatusEnum.PRESENT },
          ],
        },
        'caller-1'
      );

      expect(match.save).toHaveBeenCalled();
      expect(match.attendance.length).toBe(1);
    });

    it('should throw NotFoundException when not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      await expect(
        service.recordAttendance('bad-id', { records: [] }, 'caller-1')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findPaginated()', () => {
    it('should return paginated matches', async () => {
      const rawItems = [{ ...mockMatch, _id: 'match-1', squad: [] }];
      mockModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(rawItems),
      });
      mockModel.populate.mockResolvedValue(rawItems);
      mockModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });

      const result = await service.findPaginated({ page: 1, size: 10 });

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should apply status filter (aggregate pipeline)', async () => {
      mockModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });
      mockModel.populate.mockResolvedValue([]);
      mockModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      await service.findPaginated({
        page: 1,
        size: 10,
        filters: { status: MatchStatusEnum.UPCOMING },
      });

      expect(mockModel.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ $match: expect.objectContaining({ status: MatchStatusEnum.UPCOMING }) }),
        ])
      );
    });

    it('should use two-step query for sport filter', async () => {
      mockModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });
      mockModel.populate.mockResolvedValue([]);
      mockModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });
      mockTournamentModel.find.mockReturnValue({
        distinct: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(['t1', 't2']),
        }),
      });

      await service.findPaginated({
        page: 1,
        size: 10,
        filters: { sport: 'rugby' as any },
      });

      expect(mockTournamentModel.find).toHaveBeenCalledWith({ sport: 'rugby' });
      expect(mockModel.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              $or: [
                { tournament: { $in: ['t1', 't2'] } },
                { tournament: { $exists: false }, sport: 'rugby' },
              ],
            }),
          }),
        ])
      );
    });

    it('should use find+sort when sortBy is provided', async () => {
      const execMock = jest.fn().mockResolvedValue([mockMatch]);
      mockModel.find.mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        exec: execMock,
      });
      mockModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const result = await service.findPaginated({ page: 1, size: 10, sortBy: 'date', sortOrder: SortOrder.DESC });

      expect(mockModel.find).toHaveBeenCalled();
      expect(result.total).toBe(1);
    });
  });

  describe('findOne()', () => {
    it('should return a match by id', async () => {
      mockModel.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue(mockMatch),
      });

      const result = await service.findOne('match-1');

      expect(result).toEqual(mockMatch);
    });

    it('should throw NotFoundException when not found', async () => {
      mockModel.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue(null),
      });
      await expect(service.findOne('bad-id')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('applySquadTemplate()', () => {
    it('should apply squad players from a template', async () => {
      const squadPlayers = [
        { shirtNumber: 1, player: 'player-id-1' },
        { shirtNumber: 2, player: 'player-id-2' },
      ];
      const populated = { ...mockMatch, squad: squadPlayers };
      const match = {
        ...mockMatch,
        set: jest.fn(),
        save: jest.fn().mockResolvedValue({
          populate: jest.fn().mockResolvedValue(populated),
        }),
      };
      mockModel.findById.mockResolvedValueOnce(match);
      mockSquadsService.getPlayers.mockResolvedValueOnce(squadPlayers);

      const result = await service.applySquadTemplate('match-1', 'squad-1');

      expect(mockSquadsService.getPlayers).toHaveBeenCalledWith('squad-1');
      expect(match.set).toHaveBeenCalledWith(
        'squad',
        squadPlayers.map(({ shirtNumber, player }) => ({ shirtNumber, player }))
      );
      expect(result).toEqual(populated);
    });

    it('should throw NotFoundException when match not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      mockSquadsService.getPlayers.mockResolvedValueOnce([]);
      await expect(
        service.applySquadTemplate('bad-id', 'squad-1')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete()', () => {
    it('should delete a match', async () => {
      const match = {
        ...mockMatch,
        deleteOne: jest.fn().mockResolvedValue(true),
      };
      mockModel.findById.mockResolvedValueOnce(match);

      await service.delete('match-1');

      expect(match.deleteOne).toHaveBeenCalled();
    });

    it('should throw NotFoundException when not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      await expect(service.delete('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addVideo()', () => {
    it('should add a video to a match', async () => {
      const match = {
        ...mockMatch,
        videos: [],
        save: jest.fn().mockResolvedValue(undefined),
      };
      mockModel.findById.mockResolvedValueOnce(match);

      const result = await service.addVideo('match-1', {
        url: 'https://youtube.com/xyz',
        name: 'Highlights',
        visibility: 'all',
      } as any);

      expect(match.save).toHaveBeenCalled();
      expect(result).toHaveProperty('url', 'https://youtube.com/xyz');
      expect(result).toHaveProperty('videoId');
    });

    it('should throw NotFoundException when match not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      await expect(service.addVideo('bad-id', { url: 'x', visibility: 'all' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateVideo()', () => {
    it('should update an existing video', async () => {
      const videoId = 'vid-1';
      const match = {
        ...mockMatch,
        videos: [{ videoId, url: 'https://old.com', name: 'Old', visibility: 'all', targetPlayers: [] }],
        save: jest.fn().mockResolvedValue(undefined),
      };
      mockModel.findById.mockResolvedValueOnce(match);

      const result = await service.updateVideo('match-1', videoId, {
        url: 'https://new.com',
        name: 'New',
        visibility: 'players',
        targetPlayers: [],
      } as any);

      expect(match.save).toHaveBeenCalled();
      expect(result).toHaveProperty('url', 'https://new.com');
    });

    it('should throw NotFoundException when match not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      await expect(service.updateVideo('bad-id', 'vid-1', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when video not found', async () => {
      const match = { ...mockMatch, videos: [] };
      mockModel.findById.mockResolvedValueOnce(match);
      await expect(service.updateVideo('match-1', 'missing-vid', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteVideo()', () => {
    it('should delete a video from a match', async () => {
      const videoId = 'vid-1';
      const match = {
        ...mockMatch,
        videos: [{ videoId, url: 'x', visibility: 'all' }],
        save: jest.fn().mockResolvedValue(undefined),
      };
      mockModel.findById.mockResolvedValueOnce(match);

      await service.deleteVideo('match-1', videoId);

      expect(match.save).toHaveBeenCalled();
      expect(match.videos).toHaveLength(0);
    });

    it('should throw NotFoundException when match not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      await expect(service.deleteVideo('bad-id', 'vid-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when video not found', async () => {
      const match = { ...mockMatch, videos: [] };
      mockModel.findById.mockResolvedValueOnce(match);
      await expect(service.deleteVideo('match-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAttendanceStats()', () => {
    it('should return attendance stats grouped by category', async () => {
      const matchData = {
        category: 'm14',
        attendance: [
          { isStaff: false, status: 'present' },
          { isStaff: false, status: 'absent' },
          { isStaff: true, status: 'present' },
        ],
      };
      mockModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([matchData]),
      });

      const result = await service.getAttendanceStats();

      expect(result.byCategory).toHaveProperty('m14');
      expect(result.byCategory['m14'].matches).toBe(1);
      expect(result.byCategory['m14'].totalAttendees).toBe(2);
      expect(result.byCategory['m14'].totalPresent).toBe(1);
      expect(result.byCategory['m14'].pct).toBe(50);
    });

    it('should return pct=0 when there are no attendees', async () => {
      const matchData = { category: 'm12', attendance: [] };
      mockModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([matchData]),
      });

      const result = await service.getAttendanceStats();

      expect(result.byCategory['m12'].pct).toBe(0);
    });
  });

  // ── createBulk ────────────────────────────────────────────────────────────

  describe('createBulk()', () => {
    it('should create one match per category', async () => {
      const created = [mockMatch, { ...mockMatch, category: 'm14' }];
      (mockModel as any).insertMany = jest.fn().mockResolvedValue(created);

      const result = await service.createBulk({
        opponent: 'Rival',
        date: new Date(),
        categories: ['plantel_superior', 'm14'],
      } as any);

      expect((mockModel as any).insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ category: 'plantel_superior' }),
          expect.objectContaining({ category: 'm14' }),
        ])
      );
      expect(result).toEqual(created);
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return populated match', async () => {
      const match = { ...mockMatch, squad: [], videos: [], attachments: [], set: jest.fn() };
      mockModel.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(match) });
      const result = await service.findOne('match-1');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when not found', async () => {
      mockModel.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getFieldOptions ───────────────────────────────────────────────────────

  describe('getFieldOptions()', () => {
    it('should return opponents, venues and divisions', async () => {
      mockModel.distinct
        .mockResolvedValueOnce(['Rival 1', 'Rival 2'])
        .mockResolvedValueOnce(['Cancha A'])
        .mockResolvedValueOnce(['División 1', null]);

      const result = await service.getFieldOptions();
      expect(result.opponents).toEqual(['Rival 1', 'Rival 2']);
      expect(result.venues).toEqual(['Cancha A']);
      expect(result.divisions).toEqual(['División 1']); // null filtered out
    });
  });

  // ── addAttachment ─────────────────────────────────────────────────────────

  describe('addAttachment()', () => {
    it('should upload file and push attachment', async () => {
      const match = { ...mockMatch, attachments: [], save: jest.fn().mockResolvedValue(undefined) };
      mockModel.findById.mockResolvedValueOnce(match);
      mockGridFsService.uploadFile.mockResolvedValue('file-id-1');

      const result = await service.addAttachment('match-1', {
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from(''),
        size: 512,
      } as any, 'Mi doc', 'all');

      expect(mockGridFsService.uploadFile).toHaveBeenCalled();
      expect(match.save).toHaveBeenCalled();
      expect(result).toHaveProperty('fileId', 'file-id-1');
    });

    it('should throw NotFoundException when match not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      await expect(
        service.addAttachment('bad-id', { originalname: 'x', mimetype: 'application/pdf', buffer: Buffer.from(''), size: 0 } as any)
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── deleteAttachment ──────────────────────────────────────────────────────

  describe('deleteAttachment()', () => {
    it('should delete file from GridFS and remove from array', async () => {
      const attachment = { fileId: 'file-id-1' };
      const match = {
        ...mockMatch,
        attachments: [attachment],
        save: jest.fn().mockResolvedValue(undefined),
      };
      mockModel.findById.mockResolvedValueOnce(match);
      mockGridFsService.deleteFile.mockResolvedValue(undefined);

      await service.deleteAttachment('match-1', 'file-id-1');

      expect(mockGridFsService.deleteFile).toHaveBeenCalled();
      expect(match.save).toHaveBeenCalled();
      expect(match.attachments).toHaveLength(0);
    });

    it('should throw NotFoundException when attachment not found', async () => {
      const match = { ...mockMatch, attachments: [] };
      mockModel.findById.mockResolvedValueOnce(match);
      await expect(service.deleteAttachment('match-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findPlayerByUserId ────────────────────────────────────────────────────

  describe('findPlayerByUserId()', () => {
    it('should return player with _id selected', async () => {
      const player = { _id: 'player-id' };
      const validUserId = 'aaaaaaaaaaaaaaaaaaaaaaaa'; // valid 24-char hex
      (mockPlayerModel as any).findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(player) });
      const result = await service.findPlayerByUserId(validUserId);
      expect(result).toBe(player);
    });
  });
});
