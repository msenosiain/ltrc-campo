import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TournamentEntity } from './schemas/tournament.entity';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { TournamentFilterDto } from './dto/tournament-filter.dto';
import { PaginatedResponse, RoleEnum, SortOrder } from '@ltrc-campo/shared-api-model';
import { User } from '../users/schemas/user.schema';
import { PaginationDto } from '../shared/pagination.dto';
import { GridFsService } from '../shared/gridfs/gridfs.service';

const ATTACHMENTS_BUCKET = 'tournamentAttachments';
const LOGO_BUCKET = 'tournamentLogos';
const LOGO_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];

const ALLOWED_MIMETYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

@Injectable()
export class TournamentsService {
  constructor(
    @InjectModel(TournamentEntity.name)
    private readonly tournamentModel: Model<TournamentEntity>,
    private readonly gridFsService: GridFsService
  ) {}

  async create(dto: CreateTournamentDto, caller?: User) {
    const callerId = caller ? (caller as any)._id : undefined;
    return this.tournamentModel.create({
      ...dto,
      createdBy: callerId,
      updatedBy: callerId,
    });
  }

  async findPaginated(
    pagination: PaginationDto<TournamentFilterDto>,
    caller?: User
  ): Promise<PaginatedResponse<unknown>> {
    const {
      page,
      size,
      filters = {},
      sortBy,
      sortOrder = SortOrder.DESC,
    } = pagination;
    const skip = (page - 1) * size;
    const query: Record<string, unknown> = {};

    if (filters.searchTerm) {
      const regex = new RegExp(filters.searchTerm, 'i');
      query['$or'] = [{ name: regex }, { season: regex }];
    }
    if (filters.sport) query['sport'] = filters.sport;
    if (filters.categories?.length) query['categories'] = { $in: filters.categories };

    // Server-side restriction: limit results to user's assigned scope
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      if (caller.sports?.length) query['sport'] = { $in: caller.sports };
      if (caller.categories?.length)
        query['categories'] = { $in: caller.categories };
    }

    const sort: Record<string, 1 | -1> = sortBy
      ? { [sortBy]: sortOrder === 'asc' ? 1 : -1 }
      : { season: -1 };

    const [items, total] = await Promise.all([
      this.tournamentModel.find(query).sort(sort).skip(skip).limit(size).exec(),
      this.tournamentModel.countDocuments(query),
    ]);

    return { items, total, page, size };
  }

  async findOne(id: string) {
    const tournament = await this.tournamentModel.findById(id);
    if (!tournament) throw new NotFoundException('Tournament not found');
    return tournament;
  }

  async update(id: string, dto: UpdateTournamentDto, caller?: User) {
    const tournament = await this.tournamentModel.findById(id);
    if (!tournament) throw new NotFoundException('Tournament not found');

    Object.assign(tournament, dto);
    if (caller) tournament.updatedBy = (caller as any)._id;
    return tournament.save();
  }

  async delete(id: string) {
    const tournament = await this.tournamentModel.findById(id);
    if (!tournament) throw new NotFoundException('Tournament not found');

    for (const att of tournament.attachments ?? []) {
      await this.gridFsService.deleteFile(ATTACHMENTS_BUCKET, att.fileId).catch(() => {});
    }
    if (tournament.logoFileId) {
      await this.gridFsService.deleteFile(LOGO_BUCKET, tournament.logoFileId).catch(() => {});
    }

    return tournament.deleteOne();
  }

  async uploadLogo(
    id: string,
    file: { originalname: string; mimetype: string; buffer: Buffer }
  ) {
    if (!LOGO_MIMETYPES.includes(file.mimetype)) {
      throw new NotFoundException(`Tipo de archivo no permitido: ${file.mimetype}`);
    }
    const tournament = await this.tournamentModel.findById(id);
    if (!tournament) throw new NotFoundException('Tournament not found');

    if (tournament.logoFileId) {
      await this.gridFsService.deleteFile(LOGO_BUCKET, tournament.logoFileId).catch(() => {});
    }

    const fileId = await this.gridFsService.uploadFile(
      LOGO_BUCKET, file.originalname, file.buffer, file.mimetype
    );
    tournament.logoFileId = fileId;
    return tournament.save();
  }

  async getLogoStream(id: string) {
    const tournament = await this.tournamentModel.findById(id);
    if (!tournament?.logoFileId) throw new NotFoundException('Logo not found');
    const stream = this.gridFsService.getFileStream(LOGO_BUCKET, tournament.logoFileId);
    return { stream, mimetype: 'image/png' };
  }

  async removeLogo(id: string) {
    const tournament = await this.tournamentModel.findById(id);
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (tournament.logoFileId) {
      await this.gridFsService.deleteFile(LOGO_BUCKET, tournament.logoFileId).catch(() => {});
      tournament.logoFileId = undefined;
      return tournament.save();
    }
    return tournament;
  }

  async addAttachment(
    id: string,
    file: { originalname: string; mimetype: string; buffer: Buffer; size: number }
  ) {
    const tournament = await this.tournamentModel.findById(id);
    if (!tournament) throw new NotFoundException('Tournament not found');

    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new NotFoundException(
        `Tipo de archivo no permitido: ${file.mimetype}`
      );
    }

    const fileId = await this.gridFsService.uploadFile(
      ATTACHMENTS_BUCKET,
      file.originalname,
      file.buffer,
      file.mimetype
    );

    tournament.attachments.push({
      fileId,
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    } as any);

    await tournament.save();
    return tournament;
  }

  async getAttachmentStream(id: string, attachmentId: string) {
    const tournament = await this.tournamentModel.findById(id);
    if (!tournament) throw new NotFoundException('Tournament not found');

    const att = (tournament.attachments as any)?.id(attachmentId);
    if (!att) throw new NotFoundException('Attachment not found');

    const stream = this.gridFsService.getFileStream(
      ATTACHMENTS_BUCKET,
      att.fileId
    );
    return { stream, filename: att.filename, mimetype: att.mimetype };
  }

  async removeAttachment(id: string, attachmentId: string) {
    const tournament = await this.tournamentModel.findById(id);
    if (!tournament) throw new NotFoundException('Tournament not found');

    const att = (tournament.attachments as any)?.id(attachmentId);
    if (!att) throw new NotFoundException('Attachment not found');

    await this.gridFsService.deleteFile(ATTACHMENTS_BUCKET, att.fileId);
    att.deleteOne();
    await tournament.save();
    return tournament;
  }
}
