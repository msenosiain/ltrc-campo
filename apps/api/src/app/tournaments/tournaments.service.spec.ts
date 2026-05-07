import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TournamentsService } from './tournaments.service';
import { TournamentEntity } from './schemas/tournament.entity';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { GridFsService } from '../shared/gridfs/gridfs.service';

const mockTournament = {
  id: 'tournament-1',
  name: 'Liga Provincial',
  season: '2026',
  description: 'Torneo anual',
  save: jest.fn(),
  deleteOne: jest.fn(),
};

const mockModel = {
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  countDocuments: jest.fn(),
};

describe('TournamentsService', () => {
  let service: TournamentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsService,
        { provide: getModelToken(TournamentEntity.name), useValue: mockModel },
        { provide: GridFsService, useValue: { uploadFile: jest.fn(), deleteFile: jest.fn(), getFileStream: jest.fn() } },
      ],
    }).compile();

    service = module.get(TournamentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    it('should create a tournament', async () => {
      mockModel.create.mockResolvedValueOnce(mockTournament);
      const dto: CreateTournamentDto = {
        name: 'Liga Provincial',
        season: '2026',
      };

      const result = await service.create(dto);

      expect(mockModel.create).toHaveBeenCalledWith({ ...dto, createdBy: undefined, updatedBy: undefined });
      expect(result).toEqual(mockTournament);
    });
  });

  describe('findPaginated()', () => {
    it('should return paginated tournaments', async () => {
      const execMock = jest.fn().mockResolvedValue([mockTournament]);
      const limitMock = jest.fn().mockReturnValue({ exec: execMock });
      const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
      const sortMock = jest.fn().mockReturnValue({ skip: skipMock });
      mockModel.find.mockReturnValue({ sort: sortMock });
      mockModel.countDocuments.mockResolvedValue(1);

      const result = await service.findPaginated({ page: 1, size: 10 });

      expect(mockModel.find).toHaveBeenCalled();
      expect(result).toEqual({ items: [mockTournament], total: 1, page: 1, size: 10 });
    });
  });

  describe('findOne()', () => {
    it('should return a tournament by id', async () => {
      mockModel.findById.mockResolvedValueOnce(mockTournament);

      const result = await service.findOne('tournament-1');

      expect(mockModel.findById).toHaveBeenCalledWith('tournament-1');
      expect(result).toEqual(mockTournament);
    });

    it('should throw NotFoundException when not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      await expect(service.findOne('bad-id')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('update()', () => {
    it('should update a tournament', async () => {
      const updated = { ...mockTournament, name: 'Copa Argentina' };
      const tournament = {
        ...mockTournament,
        save: jest.fn().mockResolvedValue(updated),
      };
      mockModel.findById.mockResolvedValueOnce(tournament);

      const result = await service.update('tournament-1', {
        name: 'Copa Argentina',
      });

      expect(tournament.save).toHaveBeenCalled();
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      await expect(service.update('bad-id', {})).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('delete()', () => {
    it('should delete a tournament', async () => {
      const tournament = {
        ...mockTournament,
        deleteOne: jest.fn().mockResolvedValue(true),
      };
      mockModel.findById.mockResolvedValueOnce(tournament);

      await service.delete('tournament-1');

      expect(tournament.deleteOne).toHaveBeenCalled();
    });

    it('should throw NotFoundException when not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      await expect(service.delete('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should delete logo and attachments before deleting', async () => {
      const mockGridFs = { deleteFile: jest.fn().mockResolvedValue(undefined), uploadFile: jest.fn(), getFileStream: jest.fn() };
      const tournament = { ...mockTournament, logoFileId: 'logo-id', attachments: [{ fileId: 'att-1' }], deleteOne: jest.fn().mockResolvedValue(true) };
      mockModel.findById.mockResolvedValueOnce(tournament);

      // Re-get service with new GridFsService mock
      const module = await Test.createTestingModule({
        providers: [
          TournamentsService,
          { provide: getModelToken(TournamentEntity.name), useValue: mockModel },
          { provide: GridFsService, useValue: mockGridFs },
        ],
      }).compile();
      const svc = module.get(TournamentsService);

      await svc.delete('tournament-1');
      expect(mockGridFs.deleteFile).toHaveBeenCalledTimes(2);
      expect(tournament.deleteOne).toHaveBeenCalled();
    });
  });

  describe('uploadLogo()', () => {
    it('should upload logo and save', async () => {
      const tournament = { ...mockTournament, logoFileId: undefined, save: jest.fn().mockResolvedValue(mockTournament) };
      mockModel.findById.mockResolvedValueOnce(tournament);
      const mockGridFs = { uploadFile: jest.fn().mockResolvedValue('new-logo-id'), deleteFile: jest.fn(), getFileStream: jest.fn() };

      const module = await Test.createTestingModule({
        providers: [
          TournamentsService,
          { provide: getModelToken(TournamentEntity.name), useValue: mockModel },
          { provide: GridFsService, useValue: mockGridFs },
        ],
      }).compile();
      const svc = module.get(TournamentsService);

      await svc.uploadLogo('tournament-1', { originalname: 'logo.png', mimetype: 'image/png', buffer: Buffer.from('') });
      expect(mockGridFs.uploadFile).toHaveBeenCalled();
      expect(tournament.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException for invalid mimetype', async () => {
      await expect(
        service.uploadLogo('tournament-1', { originalname: 'file.txt', mimetype: 'text/plain', buffer: Buffer.from('') })
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when tournament not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      await expect(
        service.uploadLogo('bad-id', { originalname: 'logo.png', mimetype: 'image/png', buffer: Buffer.from('') })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLogoStream()', () => {
    it('should return stream and mimetype', async () => {
      const mockGridFs = { getFileStream: jest.fn().mockReturnValue('stream'), uploadFile: jest.fn(), deleteFile: jest.fn() };
      mockModel.findById.mockResolvedValueOnce({ ...mockTournament, logoFileId: 'logo-id' });

      const module = await Test.createTestingModule({
        providers: [
          TournamentsService,
          { provide: getModelToken(TournamentEntity.name), useValue: mockModel },
          { provide: GridFsService, useValue: mockGridFs },
        ],
      }).compile();
      const svc = module.get(TournamentsService);

      const result = await svc.getLogoStream('tournament-1');
      expect(result.mimetype).toBe('image/png');
      expect(result.stream).toBe('stream');
    });

    it('should throw NotFoundException when no logo', async () => {
      mockModel.findById.mockResolvedValueOnce({ ...mockTournament, logoFileId: undefined });
      await expect(service.getLogoStream('tournament-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeLogo()', () => {
    it('should delete logo from GridFS and clear logoFileId', async () => {
      const mockGridFs = { deleteFile: jest.fn().mockResolvedValue(undefined), uploadFile: jest.fn(), getFileStream: jest.fn() };
      const tournament = { ...mockTournament, logoFileId: 'logo-id', save: jest.fn().mockResolvedValue(undefined) };
      mockModel.findById.mockResolvedValueOnce(tournament);

      const module = await Test.createTestingModule({
        providers: [
          TournamentsService,
          { provide: getModelToken(TournamentEntity.name), useValue: mockModel },
          { provide: GridFsService, useValue: mockGridFs },
        ],
      }).compile();
      const svc = module.get(TournamentsService);

      await svc.removeLogo('tournament-1');
      expect(mockGridFs.deleteFile).toHaveBeenCalled();
      expect(tournament.logoFileId).toBeUndefined();
    });

    it('should return tournament without changes when no logo exists', async () => {
      mockModel.findById.mockResolvedValueOnce({ ...mockTournament, logoFileId: undefined });
      const result = await service.removeLogo('tournament-1');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when not found', async () => {
      mockModel.findById.mockResolvedValueOnce(null);
      await expect(service.removeLogo('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addAttachment()', () => {
    it('should upload and push attachment', async () => {
      const mockGridFs = { uploadFile: jest.fn().mockResolvedValue('file-id'), deleteFile: jest.fn(), getFileStream: jest.fn() };
      const tournament = { ...mockTournament, attachments: [] as any[], save: jest.fn().mockResolvedValue(undefined) };
      mockModel.findById.mockResolvedValueOnce(tournament);

      const module = await Test.createTestingModule({
        providers: [
          TournamentsService,
          { provide: getModelToken(TournamentEntity.name), useValue: mockModel },
          { provide: GridFsService, useValue: mockGridFs },
        ],
      }).compile();
      const svc = module.get(TournamentsService);

      await svc.addAttachment('tournament-1', { originalname: 'doc.pdf', mimetype: 'application/pdf', buffer: Buffer.from(''), size: 1024 });
      expect(mockGridFs.uploadFile).toHaveBeenCalled();
      expect(tournament.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException for invalid mimetype', async () => {
      mockModel.findById.mockResolvedValueOnce(mockTournament);
      await expect(
        service.addAttachment('tournament-1', { originalname: 'file.exe', mimetype: 'application/x-msdownload', buffer: Buffer.from(''), size: 0 })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAttachmentStream()', () => {
    it('should return stream for existing attachment', async () => {
      const attId = new Types.ObjectId();
      const attachment = { _id: attId, fileId: 'file-1', filename: 'doc.pdf', mimetype: 'application/pdf' };
      const tournament = { ...mockTournament, attachments: Object.assign([attachment], { id: () => attachment }) };
      mockModel.findById.mockResolvedValueOnce(tournament);

      const mockGridFs = { getFileStream: jest.fn().mockReturnValue('stream'), uploadFile: jest.fn(), deleteFile: jest.fn() };
      const module = await Test.createTestingModule({
        providers: [
          TournamentsService,
          { provide: getModelToken(TournamentEntity.name), useValue: mockModel },
          { provide: GridFsService, useValue: mockGridFs },
        ],
      }).compile();
      const svc = module.get(TournamentsService);

      const result = await svc.getAttachmentStream('tournament-1', attId.toString());
      expect(result.filename).toBe('doc.pdf');
    });

    it('should throw NotFoundException when attachment not found', async () => {
      const tournament = { ...mockTournament, attachments: Object.assign([], { id: () => null }) };
      mockModel.findById.mockResolvedValueOnce(tournament);
      await expect(service.getAttachmentStream('tournament-1', 'bad-att')).rejects.toThrow(NotFoundException);
    });
  });
});
