import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { File as MulterFile } from 'multer';
import { GridFsService } from '../shared/gridfs/gridfs.service';
import { MatchEntity } from './schemas/match.entity';
import { TournamentEntity } from '../tournaments/schemas/tournament.entity';
import { PlayerEntity } from '../players/schemas/player.entity';
import { PaginationDto } from '../shared/pagination.dto';
import { BlockEnum, CATEGORY_AGE_RANK, CategoryEnum, MatchStatusEnum, PaginatedResponse, RoleEnum, getBlockCategories } from '@ltrc-campo/shared-api-model';
import { MatchFiltersDto } from './match-filter.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { RecordMatchAttendanceDto } from './dto/record-match-attendance.dto';
import { ManageVideoDto } from './dto/manage-video.dto';
import { SquadsService } from '../squads/squads.service';
import { User } from '../users/schemas/user.schema';

const POPULATE_FIELDS = [
  'tournament',
  { path: 'squad.player' },
  { path: 'attendance.player' },
  { path: 'videos.targetPlayers' },
  { path: 'attachments.targetPlayers' },
];

@Injectable()
export class MatchesService {
  constructor(
    @InjectModel(MatchEntity.name)
    private readonly matchModel: Model<MatchEntity>,
    @InjectModel(TournamentEntity.name)
    private readonly tournamentModel: Model<TournamentEntity>,
    @InjectModel(PlayerEntity.name)
    private readonly playerModel: Model<PlayerEntity>,
    private readonly squadsService: SquadsService,
    private readonly gridFsService: GridFsService
  ) {}

  async create(dto: CreateMatchDto, caller?: User) {
    const callerId = caller ? (caller as any)._id : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.matchModel.create({ ...(dto as any), createdBy: callerId, updatedBy: callerId });
  }

  async createBulk(dto: import('./dto/create-match-bulk.dto').CreateMatchBulkDto, caller?: User) {
    const callerId = caller ? (caller as any)._id : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { categories, ...shared } = dto as any;
    const docs = (categories as CategoryEnum[]).map((category) => ({
      ...shared,
      category,
      createdBy: callerId,
      updatedBy: callerId,
    }));
    return this.matchModel.insertMany(docs);
  }

  async update(id: string, dto: UpdateMatchDto, caller?: User) {
    const match = await this.matchModel.findById(id);
    if (!match) throw new NotFoundException('Match not found');

    Object.assign(match, dto);
    if (caller) match.updatedBy = (caller as any)._id;
    return match.save();
  }

  async updateSquad(
    id: string,
    squad: { shirtNumber: number; playerId: string; dorsalNumber?: number; gpsNumber?: number; isCaptain?: boolean; posterLabel?: string }[]
  ) {
    const match = await this.matchModel.findById(id);
    if (!match) throw new NotFoundException('Match not found');

    match.set(
      'squad',
      squad.map(({ shirtNumber, playerId, dorsalNumber, gpsNumber, isCaptain, posterLabel }) => ({
        shirtNumber,
        player: playerId,
        ...(dorsalNumber !== undefined && { dorsalNumber }),
        ...(gpsNumber !== undefined && { gpsNumber }),
        ...(isCaptain && { isCaptain }),
        ...(posterLabel && { posterLabel }),
      }))
    );
    return this.stripOrphanedSquad(
      await (await match.save()).populate(POPULATE_FIELDS)
    );
  }

  async recordAttendance(
    matchId: string,
    dto: RecordMatchAttendanceDto,
    callerId: string
  ) {
    const match = await this.matchModel.findById(matchId);
    if (!match) throw new NotFoundException('Match not found');

    const now = new Date();

    for (const record of dto.records) {
      let existing: any;

      if (record.isStaff && record.userId) {
        existing = match.attendance.find(
          (a) => a.isStaff && a.user === record.userId
        );
        if (!existing) {
          existing = {
            user: record.userId,
            isStaff: true,
            confirmed: false,
          };
          match.attendance.push(existing);
          existing = match.attendance[match.attendance.length - 1];
        }
      } else if (record.playerId) {
        existing = match.attendance.find(
          (a) => !a.isStaff && a.player?.toString() === record.playerId
        );
        if (!existing) {
          existing = {
            player: record.playerId as any,
            isStaff: false,
            confirmed: false,
          };
          match.attendance.push(existing);
          existing = match.attendance[match.attendance.length - 1];
        }
      }

      if (existing) {
        existing.status = record.status;
        existing.markedAt = now;
        existing.markedBy = callerId;
      }
    }

    await match.save();
    return match.populate(POPULATE_FIELDS);
  }

  async findPaginated(
    pagination: PaginationDto<MatchFiltersDto>,
    caller?: User
  ): Promise<PaginatedResponse<unknown>> {
    const { page, size, filters = {}, sortBy, sortOrder = 'asc' } = pagination;
    const skip = (page - 1) * size;

    const queryFilters: Record<string, unknown> = {};

    if (filters.status) {
      queryFilters['status'] = filters.status;
    }

    if (filters.opponent) {
      queryFilters['opponent'] = filters.opponent;
    }

    if (filters.tournament) {
      if (filters.tournament === '__none__') {
        queryFilters['tournament'] = null;
      } else {
        queryFilters['tournament'] = new Types.ObjectId(filters.tournament);
      }
    }

    // Sport filter: two-step query via tournament lookup, also include friendly matches with direct sport field
    if (filters.sport) {
      const isFriendlyFilter = filters.tournament === '__none__';
      if (isFriendlyFilter) {
        // Already filtered to tournament=null above; just restrict sport
        queryFilters['sport'] = filters.sport;
      } else if (!filters.tournament) {
        // No specific tournament selected: filter by sport across tournaments + friendly matches
        const tournamentIds = await this.tournamentModel
          .find({ sport: filters.sport })
          .distinct('_id')
          .exec();
        queryFilters['$or'] = [
          { tournament: { $in: tournamentIds } },
          { tournament: { $exists: false }, sport: filters.sport },
        ];
      }
      // When a specific tournament is already selected, skip sport cross-validation:
      // the tournament filter already scopes results correctly regardless of whether
      // the tournament document has the sport field populated.
    }

    if (filters.category) {
      queryFilters['category'] = filters.category;
    }

    if (filters.division) {
      queryFilters['division'] = filters.division;
    }

    if (filters.fromDate || filters.toDate) {
      const dateFilter: Record<string, Date> = {};
      if (filters.fromDate) dateFilter['$gte'] = new Date(filters.fromDate);
      if (filters.toDate) dateFilter['$lte'] = new Date(filters.toDate);
      queryFilters['date'] = dateFilter;
    }

    if (filters.playerId) {
      queryFilters['squad.player'] = new Types.ObjectId(filters.playerId);
    }

    // Server-side restriction: limit results to user's assigned scope
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      let sports = caller.sports ?? [];
      let categories = caller.categories ?? [];

      // Fall back to linked player's sport/category when not set on the user
      if (!sports.length || !categories.length) {
        const player = await this.playerModel
          .findOne({ userId: String(caller._id) })
          .select('sport category')
          .exec();
        if (!sports.length && player?.sport) sports = [player.sport as any];
        if (!categories.length && player?.category) categories = [player.category as any];
      }

      // When a specific tournament is already selected, skip the sport $or restriction:
      // the tournament was already validated via fieldOptions scope, so the filter is trusted.
      const hasSpecificTournament =
        queryFilters['tournament'] != null && queryFilters['tournament'] !== null;
      if (sports.length && !hasSpecificTournament) {
        const sportTournamentIds = await this.tournamentModel
          .find({ sport: { $in: sports } })
          .distinct('_id')
          .exec();
        const existing = queryFilters['$or'];
        if (!existing) {
          queryFilters['$or'] = [
            { tournament: { $in: sportTournamentIds } },
            { tournament: { $exists: false }, sport: { $in: sports } },
          ];
        }
      }
      if (categories.length)
        queryFilters['category'] = { $in: categories };
    }

    if (sortBy) {
      const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
      const [items, total] = await Promise.all([
        this.matchModel
          .find(queryFilters)
          .skip(skip)
          .limit(size)
          .sort(sort)
          .populate(POPULATE_FIELDS)
          .exec(),
        this.matchModel.countDocuments(queryFilters).exec(),
      ]);
      return { items, total, page, size };
    }

    // Default sort: upcoming matches first (ASC by date), past matches below (DESC by date).
    // Within the same day: earlier time first, then highest category rank first.
    const now = new Date();
    const categoryRankSwitch = {
      $switch: {
        branches: Object.entries(CATEGORY_AGE_RANK).map(([cat, rank]) => ({
          case: { $eq: ['$category', cat] },
          then: rank,
        })),
        default: -1,
      },
    };

    const pipeline: any[] = [
      { $match: queryFilters },
      {
        $addFields: {
          _isPast: { $cond: [{ $lt: ['$date', now] }, 1, 0] },
          _distanceMs: {
            $cond: [
              { $gte: ['$date', now] },
              { $subtract: ['$date', now] },
              { $subtract: [now, '$date'] },
            ],
          },
          _categoryRank: categoryRankSwitch,
        },
      },
      { $sort: { _isPast: 1, _distanceMs: 1, time: 1, _categoryRank: -1 } },
      { $skip: skip },
      { $limit: size },
      { $project: { _isPast: 0, _distanceMs: 0, _categoryRank: 0 } },
    ];

    const [rawItems, total] = await Promise.all([
      this.matchModel.aggregate(pipeline).exec(),
      this.matchModel.countDocuments(queryFilters).exec(),
    ]);

    const items = await this.matchModel.populate(rawItems, POPULATE_FIELDS as any);
    const stripped = items.map((m: any) => {
      m.squad = (m.squad ?? []).filter((e: any) => e.player != null);
      if (!m.id && m._id) m.id = m._id.toString();
      return m;
    });

    return { items: stripped, total, page, size };
  }

  async addAttachment(matchId: string, file: MulterFile, name?: string, visibility: 'all' | 'staff' | 'players' = 'all', targetPlayers?: string[]) {
    const match = await this.matchModel.findById(matchId);
    if (!match) throw new NotFoundException('Match not found');

    const fileId = await this.gridFsService.uploadFile(
      'matchAttachments',
      file.originalname,
      file.buffer,
      file.mimetype
    );

    const attachment = {
      fileId,
      filename: file.originalname,
      mimeType: file.mimetype,
      visibility,
      ...(name ? { name } : {}),
      targetPlayers: targetPlayers?.map((id) => new Types.ObjectId(id)) ?? [],
    };
    match.attachments = match.attachments ?? [];
    match.attachments.push(attachment);
    await match.save();

    return attachment;
  }

  async updateAttachment(matchId: string, fileId: string, name: string, visibility: 'all' | 'staff' | 'players', targetPlayers?: string[]) {
    const match = await this.matchModel.findById(matchId);
    if (!match) throw new NotFoundException('Match not found');

    const idx = (match.attachments ?? []).findIndex((a) => a.fileId === fileId);
    if (idx === -1) throw new NotFoundException('Attachment not found');

    (match.attachments![idx] as any).name = name;
    (match.attachments![idx] as any).visibility = visibility;
    (match.attachments![idx] as any).targetPlayers = targetPlayers?.map((id) => new Types.ObjectId(id)) ?? [];
    match.markModified('attachments');
    await match.save();

    return match.attachments![idx];
  }

  async getAttachmentStream(matchId: string, fileId: string) {
    const match = await this.matchModel.findById(matchId);
    if (!match) throw new NotFoundException('Match not found');
    const att = match.attachments?.find((a) => a.fileId === fileId);
    if (!att) throw new NotFoundException('Attachment not found');
    return {
      stream: this.gridFsService.getFileStream('matchAttachments', fileId),
      mimeType: att.mimeType,
      filename: att.filename,
    };
  }

  async deleteAttachment(matchId: string, fileId: string) {
    const match = await this.matchModel.findById(matchId);
    if (!match) throw new NotFoundException('Match not found');
    const idx = match.attachments?.findIndex((a) => a.fileId === fileId) ?? -1;
    if (idx === -1) throw new NotFoundException('Attachment not found');

    await this.gridFsService.deleteFile('matchAttachments', fileId);
    match.attachments.splice(idx, 1);
    await match.save();
  }

  async findPlayerByUserId(userId: string) {
    return this.playerModel.findOne({ userId: new Types.ObjectId(userId) }).select('_id');
  }

  async getFieldOptions(caller?: User, category?: CategoryEnum) {
    let scopeFilter: Record<string, unknown> | undefined;

    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      let sports = caller.sports ?? [];
      let categories = caller.categories ?? [];

      if (!sports.length || !categories.length) {
        const player = await this.playerModel
          .findOne({ userId: String(caller._id) })
          .select('sport category')
          .exec();
        if (!sports.length && player?.sport) sports = [player.sport as any];
        if (!categories.length && player?.category) categories = [player.category as any];
      }

      if (sports.length || categories.length) {
        scopeFilter = {};
        if (sports.length) {
          const sportTournamentIds = await this.tournamentModel
            .find({ sport: { $in: sports } })
            .distinct('_id')
            .exec();
          scopeFilter['$or'] = [
            { tournament: { $in: sportTournamentIds } },
            { tournament: { $exists: false }, sport: { $in: sports } },
          ];
        }
        if (categories.length) {
          scopeFilter['category'] = { $in: categories };
        }
      }
    }

    const filter = scopeFilter ?? {};
    const divisionFilter = category ? { ...filter, category } : filter;
    const [opponents, venues, divisions, tournamentObjectIds] = await Promise.all([
      this.matchModel.distinct('opponent', filter),
      this.matchModel.distinct('venue', filter),
      this.matchModel.distinct('division', divisionFilter).then((vals) => vals.filter(Boolean)),
      scopeFilter ? this.matchModel.distinct('tournament', filter) : Promise.resolve(null),
    ]);

    const result: { opponents: string[]; venues: string[]; divisions: string[]; tournamentIds?: string[] } = {
      opponents,
      venues,
      divisions,
    };

    if (tournamentObjectIds !== null) {
      result.tournamentIds = (tournamentObjectIds as any[]).map((id) => id.toString());
    }

    return result;
  }

  async findOne(id: string, caller?: User) {
    const match = await this.matchModel.findById(id).populate(POPULATE_FIELDS);
    if (!match) throw new NotFoundException('Match not found');

    if (caller) {
      const staffRoles: RoleEnum[] = [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.ANALYST, RoleEnum.COACH, RoleEnum.TRAINER];
      const isStaff = caller.roles?.some((r) => staffRoles.includes(r as RoleEnum));

      if (!isStaff) {
        const player = await this.playerModel.findOne({ userId: (caller as any)._id });
        const playerId = player?._id?.toString();

        if (match.videos?.length) {
          match.set('videos', (match.videos ?? []).filter((v) => {
            if (v.visibility === 'all') return true;
            if (v.visibility === 'players' && playerId) {
              return (v.targetPlayers as any[])?.some(
                (p) => (p._id ?? p).toString() === playerId
              );
            }
            return false;
          }));
        }

        if (match.attachments?.length) {
          match.set('attachments', (match.attachments ?? []).filter((a) => {
            if (a.visibility === 'all') return true;
            if (a.visibility === 'players' && playerId) {
              return (a.targetPlayers as any[])?.some(
                (p) => (p._id ?? p).toString() === playerId
              );
            }
            return false;
          }));
        }
      }
    }

    return this.stripOrphanedSquad(match);
  }

  async addVideo(matchId: string, dto: ManageVideoDto) {
    const match = await this.matchModel.findById(matchId);
    if (!match) throw new NotFoundException('Match not found');

    const videoId = new Types.ObjectId().toHexString();
    const video = {
      videoId,
      url: dto.url,
      name: dto.name,
      description: dto.description,
      visibility: dto.visibility,
      targetPlayers: dto.targetPlayers?.map((id) => new Types.ObjectId(id)) ?? [],
    };
    match.videos = match.videos ?? [];
    match.videos.push(video as any);
    await match.save();
    return video;
  }

  async updateVideo(matchId: string, videoId: string, dto: ManageVideoDto) {
    const match = await this.matchModel.findById(matchId);
    if (!match) throw new NotFoundException('Match not found');

    const idx = (match.videos ?? []).findIndex((v) => v.videoId === videoId);
    if (idx === -1) throw new NotFoundException('Video not found');

    match.videos![idx] = {
      videoId,
      url: dto.url,
      name: dto.name,
      description: dto.description,
      visibility: dto.visibility,
      targetPlayers: dto.targetPlayers?.map((id) => new Types.ObjectId(id)) ?? [],
    } as any;
    await match.save();
    return match.videos![idx];
  }

  async deleteVideo(matchId: string, videoId: string) {
    const match = await this.matchModel.findById(matchId);
    if (!match) throw new NotFoundException('Match not found');

    const idx = (match.videos ?? []).findIndex((v) => v.videoId === videoId);
    if (idx === -1) throw new NotFoundException('Video not found');

    match.videos!.splice(idx, 1);
    await match.save();
  }

  private stripOrphanedSquad(match: MatchEntity) {
    match.set(
      'squad',
      (match.squad ?? []).filter((e) => e.player != null)
    );
    return match;
  }

  async applySquadTemplate(id: string, squadId: string) {
    const [match, squadEntries] = await Promise.all([
      this.matchModel.findById(id),
      this.squadsService.getPlayers(squadId),
    ]);
    if (!match) throw new NotFoundException('Match not found');

    match.set(
      'squad',
      squadEntries.map((e) => ({
        shirtNumber: e.shirtNumber,
        player: e.player,
      }))
    );
    return this.stripOrphanedSquad(
      await (await match.save()).populate(POPULATE_FIELDS)
    );
  }

  async getAttendanceStats(caller?: User, sport?: string, category?: string): Promise<{
    byCategory: Record<string, { matches: number; totalPresent: number; totalAttendees: number; pct: number }>;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - 28);

    const scopeFilter: Record<string, unknown> = {
      status: MatchStatusEnum.COMPLETED,
      date: { $lte: new Date(), $gte: since },
    };
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      const sports = caller.sports ?? [];
      const categories = caller.categories ?? [];
      if (sports.length) scopeFilter['sport'] = { $in: sports };
      if (categories.length) scopeFilter['category'] = { $in: categories };
    }
    if (sport) scopeFilter['sport'] = sport;
    if (category) scopeFilter['category'] = category;

    const matches = await this.matchModel.find(scopeFilter).lean();

    const stats: Record<string, { matches: number; totalPresent: number; totalAttendees: number }> = {};
    for (const m of matches) {
      const cat = m.category as string;
      if (!stats[cat]) stats[cat] = { matches: 0, totalPresent: 0, totalAttendees: 0 };
      stats[cat].matches++;
      const playerAttendance = (m.attendance ?? []).filter((a: any) => !a.isStaff);
      stats[cat].totalAttendees += playerAttendance.length;
      stats[cat].totalPresent += playerAttendance.filter((a: any) => a.status === 'present').length;
    }

    const byCategory: Record<string, { matches: number; totalPresent: number; totalAttendees: number; pct: number }> = {};
    for (const [cat, data] of Object.entries(stats)) {
      byCategory[cat] = {
        ...data,
        pct: data.totalAttendees > 0 ? Math.round((data.totalPresent / data.totalAttendees) * 100) : 0,
      };
    }

    return { byCategory };
  }

  async getAttendanceTrend(
    caller?: User,
    filters?: { sport?: string; category?: string; period?: string; categoryGroup?: 'competitive' | 'non-competitive' },
  ): Promise<{ labels: string[]; matches: number[]; present: number[]; attendees: number[]; pct: number[] }> {
    const weeks = filters?.period === '1m' ? 5 : filters?.period === '3m' ? 13 : 26;
    const since = new Date();
    since.setDate(since.getDate() - weeks * 7);

    const scopeFilter: Record<string, unknown> = {
      status: MatchStatusEnum.COMPLETED,
      date: { $lte: new Date(), $gte: since },
    };
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      const sports = caller.sports ?? [];
      const categories = caller.categories ?? [];
      if (sports.length) scopeFilter['sport'] = { $in: sports };
      if (categories.length) scopeFilter['category'] = { $in: categories };
    }
    if (filters?.sport) scopeFilter['sport'] = filters.sport;
    if (filters?.category) scopeFilter['category'] = filters.category;
    if (filters?.categoryGroup) {
      const nonCompetitiveCats = [
        ...getBlockCategories(BlockEnum.INFANTILES),
        ...getBlockCategories(BlockEnum.CADETES),
      ];
      const competitiveCats = [
        ...getBlockCategories(BlockEnum.JUVENILES),
        ...getBlockCategories(BlockEnum.MAYORES),
        ...getBlockCategories(BlockEnum.PLANTEL_SUPERIOR),
      ];
      scopeFilter['category'] = { $in: filters.categoryGroup === 'non-competitive' ? nonCompetitiveCats : competitiveCats };
    }

    const matchDocs = await this.matchModel.find(scopeFilter).lean();

    const buckets: Record<string, { matches: number; present: number; attendees: number }> = {};
    for (const m of matchDocs) {
      const d = new Date(m.date);
      const year = d.getUTCFullYear();
      const startOfYear = new Date(Date.UTC(year, 0, 1));
      const week = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getUTCDay() + 1) / 7);
      const key = `${year}-W${String(week).padStart(2, '0')}`;

      if (!buckets[key]) buckets[key] = { matches: 0, present: 0, attendees: 0 };
      buckets[key].matches++;
      const playerAtt = (m.attendance ?? []).filter((a: any) => !a.isStaff);
      buckets[key].attendees += playerAtt.length;
      buckets[key].present += playerAtt.filter((a: any) => a.status === 'present').length;
    }

    const labels: string[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      const year = d.getFullYear();
      const startOfYear = new Date(Date.UTC(year, 0, 1));
      const week = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getUTCDay() + 1) / 7);
      const key = `${year}-W${String(week).padStart(2, '0')}`;
      if (!labels.includes(key)) labels.push(key);
    }

    return {
      labels,
      matches: labels.map((l) => buckets[l]?.matches ?? 0),
      present: labels.map((l) => buckets[l]?.present ?? 0),
      attendees: labels.map((l) => buckets[l]?.attendees ?? 0),
      pct: labels.map((l) => {
        const b = buckets[l];
        return b && b.attendees > 0 ? Math.round((b.present / b.attendees) * 100) : 0;
      }),
    };
  }

  async delete(id: string) {
    const match = await this.matchModel.findById(id);
    if (!match) throw new NotFoundException('Match not found');
    return match.deleteOne();
  }
}
