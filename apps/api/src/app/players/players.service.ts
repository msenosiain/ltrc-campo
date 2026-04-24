import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PlayerEntity } from './schemas/player.entity';
import { GridFsService } from '../shared/gridfs/gridfs.service';
import type { File as MulterFile } from 'multer';
import { PaginationDto } from '../shared/pagination.dto';
import {
  calculateCategory,
  CategoryEnum,
  ClothingSizesEnum,
  HockeyPositions,
  parseDate,
  PaginatedResponse,
  Player,
  PlayerAvailabilityEnum,
  PlayerStatusEnum,
  RoleEnum,
  RugbyPositions,
  SportEnum,
  toTitleCase,
} from '@ltrc-campo/shared-api-model';
import { PlayerFiltersDto } from './player-filter.dto';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { ImportPlayerRow, PadronRow, SurveyRow } from './dto/import-player.dto';
import * as XLSX from 'xlsx';
import { UsersService } from '../users/users.service';
import { User } from '../users/schemas/user.schema';
import { BranchAssignmentEntity } from '../branch-assignments/schemas/branch-assignment.entity';

@Injectable()
export class PlayersService {
  constructor(
    @InjectModel(PlayerEntity.name)
    private readonly playerModel: Model<PlayerEntity>,
    @InjectModel(BranchAssignmentEntity.name)
    private readonly branchAssignmentModel: Model<BranchAssignmentEntity>,
    private readonly gridFsService: GridFsService,
    private readonly usersService: UsersService
  ) {}

  async create(dto: CreatePlayerDto, photo?: MulterFile, caller?: User) {
    let photoId: string | undefined;

    if (photo) {
      photoId = await this.gridFsService.uploadFile(
        'playersPhotos',
        photo.originalname,
        photo.buffer,
        photo.mimetype
      );
    }

    const callerId = caller ? (caller as any)._id : undefined;
    let player;
    try {
      player = await this.playerModel.create({
        ...dto,
        photoId,
        createdBy: callerId,
        updatedBy: callerId,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        const field = Object.keys(err.keyPattern ?? {})[0];
        const value = err.keyValue?.[field];
        throw new ConflictException(
          `Ya existe un jugador con ${field} "${value}"`
        );
      }
      throw err;
    }

    if (dto.createUser && dto.email) {
      const existing = await this.usersService.findOneByEmail(dto.email);
      if (existing) {
        throw new ConflictException(
          `El email ${dto.email} ya está registrado como usuario`
        );
      }

      const user = await this.usersService.create({
        name: dto.name,
        email: dto.email,
        roles: [RoleEnum.PLAYER],
      });

      player.userId = (user as any)._id;
      await player.save();
    }

    return player;
  }

  async update(id: string, dto: UpdatePlayerDto, photo?: MulterFile, caller?: User) {
    const player = await this.playerModel.findById(id);
    if (!player) throw new NotFoundException('Player not found');

    if (photo) {
      if (player.photoId) {
        await this.gridFsService.deleteFile('playersPhotos', player.photoId);
      }
      player.photoId = await this.gridFsService.uploadFile(
        'playersPhotos',
        photo.originalname,
        photo.buffer,
        photo.mimetype
      );
    }

    const cleanDto = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined)
    );
    Object.assign(player, cleanDto);
    if (dto.trialStartDate !== undefined && dto.trialStartDate !== null) {
      player.trialStartDate =
        dto.trialStartDate instanceof Date
          ? dto.trialStartDate
          : new Date(dto.trialStartDate as unknown as string);
      player.markModified('trialStartDate');
    }
    if (dto.availability !== undefined) {
      player.markModified('availability');
    }
    // Solo admins pueden cambiar status a ACTIVE o INACTIVE
    const callerRoles: string[] = (caller as any)?.roles ?? [];
    const callerIsAdmin = callerRoles.includes(RoleEnum.ADMIN);
    if (!callerIsAdmin && dto.status && dto.status !== PlayerStatusEnum.TRIAL) {
      delete cleanDto['status'];
    }

    if (caller) player.updatedBy = (caller as any)._id;
    if (dto.status === PlayerStatusEnum.INACTIVE && player.status !== PlayerStatusEnum.INACTIVE) {
      (player as any).inactivatedAt = new Date();
    }

    if (dto.createUser && dto.email && !player.userId) {
      const existing = await this.usersService.findOneByEmail(dto.email);
      if (existing) {
        throw new ConflictException(
          `El email ${dto.email} ya está registrado como usuario`
        );
      }

      const user = await this.usersService.create({
        name: dto.name ?? player.name,
        email: dto.email,
        roles: [RoleEnum.PLAYER],
      });

      player.userId = (user as any)._id;
    }

    let saved;
    try {
      saved = await player.save();
    } catch (err: any) {
      if (err?.code === 11000) {
        const field = Object.keys(err.keyPattern ?? {})[0];
        const value = err.keyValue?.[field];
        throw new ConflictException(
          `Ya existe un jugador con ${field} "${value}"`
        );
      }
      throw err;
    }

    if (dto.branch && saved.sport === SportEnum.HOCKEY && saved.category) {
      const season = new Date().getFullYear();
      await this.branchAssignmentModel.findOneAndUpdate(
        { player: saved._id, season },
        {
          branch: dto.branch,
          category: saved.category,
          sport: SportEnum.HOCKEY,
          assignedAt: new Date(),
        },
        { upsert: true }
      );
    }

    return saved;
  }

  async findPaginated(
    pagination: PaginationDto<PlayerFiltersDto>,
    caller?: User
  ): Promise<PaginatedResponse<Player>> {
    const { page, size, filters = {}, sortBy, sortOrder = 'asc' } = pagination;
    const skip = (page - 1) * size;

    const queryFilters: Record<string, unknown> = {};
    const andConditions: Record<string, unknown>[] = [];

    // status filter — when specified, filter by status (ACTIVE includes legacy docs without field)
    if (filters.status) {
      if (filters.status === PlayerStatusEnum.ACTIVE) {
        andConditions.push({
          $or: [
            { status: PlayerStatusEnum.ACTIVE },
            { status: { $exists: false } },
          ],
        });
      } else {
        queryFilters['status'] = filters.status;
      }
    }
    // no filter: show all players regardless of status

    // searchTerm → name o nickName
    // Each word in the term is matched independently (AND) against name or nickName.
    // The fuzzy pattern allows extra chars between letters AND tolerates 1 wrong char
    // by also trying each word with each letter deleted (handles typos like "bnildo" → "Bildosola").
    if (filters.searchTerm) {
      const makeSubseq = (s: string) =>
        s.split('').join('[^a-záéíóúüñ]*');

      const buildVariants = (word: string): string[] => {
        const cleaned = word.replace(/[^a-záéíóúüñ]/gi, '').toLowerCase();
        if (!cleaned) return [];
        const variants = [makeSubseq(cleaned)];
        if (cleaned.length >= 4) {
          for (let i = 0; i < cleaned.length; i++) {
            const shortened = cleaned.slice(0, i) + cleaned.slice(i + 1);
            if (shortened.length >= 3) variants.push(makeSubseq(shortened));
          }
        }
        return [...new Set(variants)];
      };

      const words = filters.searchTerm
        .replace(/[^a-záéíóúüñ\s]/gi, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      for (const word of words) {
        const variants = buildVariants(word);
        if (!variants.length) continue;
        const regex = new RegExp(`(${variants.join('|')})`, 'i');
        andConditions.push({
          $or: [
            { name: { $regex: regex } },
            { nickName: { $regex: regex } },
          ],
        });
      }
    }

    // position → busca en el array positions
    if (filters.position) {
      queryFilters['positions'] = filters.position;
    }

    // noPosition → jugadores sin posición cargada
    if (filters.noPosition) {
      andConditions.push({
        $or: [
          { positions: { $exists: false } },
          { positions: { $size: 0 } },
        ],
      });
    }

    // sport
    if (filters.sport) {
      queryFilters['sport'] = filters.sport;
    }

    // category
    if (filters.categories?.length) {
      queryFilters['category'] = { $in: filters.categories };
    } else if (filters.category) {
      queryFilters['category'] = filters.category;
    }

    // branch (hockey)
    if (filters.branch) {
      queryFilters['branch'] = filters.branch;
    }

    // availability: filter by specific availability status
    if (filters.availability) {
      if (filters.availability === PlayerAvailabilityEnum.AVAILABLE) {
        andConditions.push({
          $or: [
            { 'availability.status': { $exists: false } },
            { 'availability.status': PlayerAvailabilityEnum.AVAILABLE },
          ],
        });
      } else {
        queryFilters['availability.status'] = filters.availability;
      }
    }

    // availableForTraining: exclude called_up, suspended, leave (keep injured + available)
    if (filters.availableForTraining) {
      andConditions.push({
        $or: [
          { 'availability.status': { $exists: false } },
          { 'availability.status': PlayerAvailabilityEnum.AVAILABLE },
          { 'availability.status': PlayerAvailabilityEnum.INJURED },
        ],
      });
    }

    // playerIds: restrict results to a specific set of IDs (used for eligibility filter)
    if (filters.playerIds?.length) {
      queryFilters['_id'] = { $in: filters.playerIds.map((id) => new Types.ObjectId(id)) };
    }

    // Server-side restriction: limit results to user's assigned scope
    // (applies to any non-admin user with sports/categories/branches assigned)
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      if (caller.sports?.length) queryFilters['sport'] = { $in: caller.sports };
      if (caller.categories?.length)
        queryFilters['category'] = { $in: caller.categories };
      if (caller.branches?.length)
        queryFilters['branch'] = { $in: caller.branches };
    }

    if (andConditions.length) {
      queryFilters['$and'] = andConditions;
    }

    // Sorting
    const sort: Record<string, 1 | -1> = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort['name'] = 1;
    }

    // When searching without explicit sort, boost results where the term matches
    // the last word of the name (apellido) so "Martin Santiago" appears first
    // when searching "Santiago".
    if (filters.searchTerm && !sortBy) {
      const termRegex = filters.searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const [items, total] = await Promise.all([
        this.playerModel.aggregate([
          { $match: queryFilters },
          {
            $addFields: {
              id: { $toString: '$_id' },
              _lastNameMatch: {
                $cond: {
                  if: {
                    $regexMatch: {
                      input: { $arrayElemAt: [{ $split: ['$name', ' '] }, 0] },
                      regex: termRegex,
                      options: 'i',
                    },
                  },
                  then: 1,
                  else: 0,
                },
              },
            },
          },
          { $sort: { _lastNameMatch: -1, name: 1 } },
          { $skip: skip },
          { $limit: size },
        ]),
        this.playerModel.countDocuments(queryFilters).exec(),
      ]);
      return { items: items as unknown as Player[], total, page, size };
    }

    // Query a MongoDB
    const [items, total] = await Promise.all([
      this.playerModel
        .find(queryFilters)
        .skip(skip)
        .limit(size)
        .sort(sort)
        .exec(),
      this.playerModel.countDocuments(queryFilters).exec(),
    ]);

    return { items: items as unknown as Player[], total, page, size };
  }

  async getFieldOptions() {
    const healthInsurances = await this.playerModel
      .distinct('medicalData.healthInsurance')
      .then((vals) => vals.filter(Boolean));
    return { healthInsurances };
  }

  async findOne(id: string) {
    const player = await this.playerModel.findById(id);
    if (!player) throw new NotFoundException('Player not found');
    return player;
  }

  async findByUserId(userId: string): Promise<PlayerEntity | null> {
    return this.playerModel.findOne({ userId: new Types.ObjectId(userId) });
  }

  async updateSelf(userId: string, dto: { address?: { phoneNumber?: string }; clothingSizes?: { jersey?: ClothingSizesEnum; shorts?: ClothingSizesEnum; sweater?: ClothingSizesEnum; pants?: ClothingSizesEnum } }) {
    const player = await this.playerModel.findOne({ userId: new Types.ObjectId(userId) });
    if (!player) throw new NotFoundException('No player linked to this user');

    if (dto.address !== undefined) {
      player.address = { ...(player.address ?? { phoneNumber: '' }), ...dto.address };
    }
    if (dto.clothingSizes !== undefined) {
      player.clothingSizes = { ...(player.clothingSizes ?? {}), ...dto.clothingSizes };
    }

    return player.save();
  }

  async getPhotoStream(photoId: string) {
    return this.gridFsService.getFileStream('playersPhotos', photoId);
  }

  async deletePhoto(id: string) {
    const player = await this.playerModel.findById(id);
    if (!player) throw new NotFoundException('Player not found');
    if (player.photoId) {
      await this.gridFsService.deleteFile('playersPhotos', player.photoId);
      player.photoId = undefined;
      await player.save();
    }
    return { ok: true };
  }

  async updateAvailability(
    id: string,
    dto: { status: PlayerAvailabilityEnum; reason?: string; since?: string; estimatedReturn?: string }
  ) {
    const player = await this.playerModel.findById(id);
    if (!player) throw new NotFoundException('Player not found');

    player.availability = {
      status: dto.status,
      reason: dto.reason,
      since: dto.since ? parseDate(dto.since) : undefined,
      estimatedReturn: dto.estimatedReturn ? parseDate(dto.estimatedReturn) : undefined,
    } as any;

    return player.save();
  }

  async delete(id: string) {
    const player = await this.playerModel.findById(id);
    if (!player) throw new NotFoundException('Player not found');

    if (player.photoId) {
      await this.gridFsService.deleteFile('playersPhotos', player.photoId);
    }

    return player.deleteOne();
  }

  async getStats(caller?: User): Promise<{ byCategory: Record<string, number>; total: number }> {
    const queryFilters: Record<string, unknown> = { status: { $ne: 'inactive' } };
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      if (caller.sports?.length) queryFilters['sport'] = { $in: caller.sports };
      if (caller.categories?.length) queryFilters['category'] = { $in: caller.categories };
    }
    const results = await this.playerModel.aggregate([
      { $match: queryFilters },
      { $group: { _id: { category: '$category', sport: '$sport' }, count: { $sum: 1 } } },
    ]);
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const r of results) {
      const { category, sport } = r._id;
      // For PLANTEL_SUPERIOR, split by sport so the widget can show them separately
      const key = category === 'plantel_superior' && sport
        ? `plantel_superior:${sport}`
        : category;
      byCategory[key] = (byCategory[key] ?? 0) + r.count;
      total += r.count;
    }
    return { byCategory, total };
  }

  async getGrowthStats(caller?: User, period = '6m'): Promise<{
    labels: string[];
    rugby: { altas: number[]; bajas: number[] };
    hockey: { altas: number[]; bajas: number[] };
  }> {
    const months = period === '1m' ? 1 : period === '3m' ? 3 : 6;
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const scopeFilter: Record<string, unknown> = {};
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      if (caller.sports?.length) scopeFilter['sport'] = { $in: caller.sports };
      if (caller.categories?.length) scopeFilter['category'] = { $in: caller.categories };
    }

    const aggregateGrowth = (extraFilter: Record<string, unknown>, dateField: string) =>
      this.playerModel.aggregate([
        { $match: { ...scopeFilter, ...extraFilter, [dateField]: { $gte: since } } },
        { $group: { _id: { year: { $year: `$${dateField}` }, month: { $month: `$${dateField}` } }, count: { $sum: 1 } } },
      ]);

    const [rugbyAltas, rugbyBajas, hockeyAltas, hockeyBajas] = await Promise.all([
      aggregateGrowth({ sport: SportEnum.RUGBY }, 'createdAt'),
      aggregateGrowth({ sport: SportEnum.RUGBY }, 'inactivatedAt'),
      aggregateGrowth({ sport: SportEnum.HOCKEY }, 'createdAt'),
      aggregateGrowth({ sport: SportEnum.HOCKEY }, 'inactivatedAt'),
    ]);

    const labels: string[] = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const toMap = (raw: { _id: { year: number; month: number }; count: number }[]) =>
      Object.fromEntries(raw.map((r) => [`${r._id.year}-${String(r._id.month).padStart(2, '0')}`, r.count]));

    return {
      labels,
      rugby: {
        altas: labels.map((l) => toMap(rugbyAltas)[l] ?? 0),
        bajas: labels.map((l) => toMap(rugbyBajas)[l] ?? 0),
      },
      hockey: {
        altas: labels.map((l) => toMap(hockeyAltas)[l] ?? 0),
        bajas: labels.map((l) => toMap(hockeyBajas)[l] ?? 0),
      },
    };
  }

  async getAgeDistribution(caller?: User): Promise<{
    all: { birthYear: number; count: number }[];
    rugby: { birthYear: number; count: number }[];
    hockey: { birthYear: number; count: number }[];
  }> {
    const scopeFilter: Record<string, unknown> = { status: { $ne: PlayerStatusEnum.INACTIVE }, birthDate: { $exists: true } };
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      if (caller.sports?.length) scopeFilter['sport'] = { $in: caller.sports };
      if (caller.categories?.length) scopeFilter['category'] = { $in: caller.categories };
    }

    const aggregate = (extraFilter: Record<string, unknown> = {}) =>
      this.playerModel.aggregate([
        { $match: { ...scopeFilter, ...extraFilter } },
        { $group: { _id: { $year: '$birthDate' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);

    const [allRaw, rugbyRaw, hockeyRaw] = await Promise.all([
      aggregate(),
      aggregate({ sport: SportEnum.RUGBY }),
      aggregate({ sport: SportEnum.HOCKEY }),
    ]);

    const toRows = (raw: { _id: number; count: number }[]) =>
      raw.map((r) => ({ birthYear: r._id, count: r.count }));

    return { all: toRows(allRaw), rugby: toRows(rugbyRaw), hockey: toRows(hockeyRaw) };
  }

  async importFromFile(
    buffer: Buffer
  ): Promise<{ created: number; updated: number; errors: { row: number; message: string }[] }> {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    let created = 0;
    let updated = 0;
    const errors: { row: number; message: string }[] = [];

    const sportMap: Record<string, SportEnum> = {
      hockey: SportEnum.HOCKEY,
      rugby: SportEnum.RUGBY,
    };

    // Categorías fijas del padrón (no dependen de la edad)
    const fixedCategoryMap: Record<string, CategoryEnum> = {
      HM: CategoryEnum.PLANTEL_SUPERIOR,
      HMV: CategoryEnum.MASTER,
      RM: CategoryEnum.PLANTEL_SUPERIOR,
    };
    // Estas se calculan por fecha de nacimiento + deporte
    const calculateFromAge = new Set(['HCM', 'HI', 'RC', 'RI', 'RJ']);

    for (const sheetName of workbook.SheetNames) {
      const sport = sportMap[sheetName.toLowerCase()];
      if (!sport) continue; // ignorar hojas que no sean hockey/rugby

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<PadronRow>(sheet);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        const label = `[${sheetName}] fila ${rowNum}`;

        const str = (val: unknown) => (val != null ? String(val).trim() : '');

        const name = toTitleCase(str(row.Nombre));
        const idNumber = str(row['N° Doc.']).replace(/\D/g, '');

        if (!name) {
          errors.push({ row: rowNum, message: `${label}: Nombre es requerido` });
          continue;
        }
        if (!idNumber) {
          errors.push({ row: rowNum, message: `${label}: N° Doc. es requerido` });
          continue;
        }

        const birthDate = parseDate(row['Fecha Nac.']);
        if (!birthDate) {
          errors.push({ row: rowNum, message: `${label}: Fecha Nac. inválida` });
          continue;
        }

        const categoryKey = str(row['Categoría']).toUpperCase();
        let category: CategoryEnum | undefined;
        if (fixedCategoryMap[categoryKey]) {
          category = fixedCategoryMap[categoryKey];
        } else if (calculateFromAge.has(categoryKey)) {
          category = calculateCategory(birthDate.getFullYear(), sport);
        } else {
          errors.push({ row: rowNum, message: `${label}: Categoría desconocida "${categoryKey}"` });
          continue;
        }

        const memberNumber = row.Socio ? String(row.Socio) : undefined;

        try {
          const existing = await this.playerModel.findOne({
            idNumber: { $regex: new RegExp(idNumber) },
          });
          if (existing) {
            // Never overwrite existing name — only update sport/category/birthDate/memberNumber
            await this.playerModel.findByIdAndUpdate(existing._id, {
              birthDate,
              sport,
              category,
              ...(memberNumber ? { memberNumber } : {}),
            });
            updated++;
          } else {
            await this.playerModel.create({ name, idNumber, birthDate, sport, category, memberNumber });
            created++;
          }
        } catch (err) {
          errors.push({ row: rowNum, message: `${label}: ${(err as Error).message}` });
        }
      }
    }

    return { created, updated, errors };
  }

  async updateFromSurvey(buffer: Buffer): Promise<{
    updated: number;
    notFound: { row: number; dni: string; name: string }[];
    errors: { row: number; message: string }[];
  }> {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<SurveyRow>(sheet);

    let updated = 0;
    const notFound: { row: number; dni: string; name: string }[] = [];
    const errors: { row: number; message: string }[] = [];

    const validSizes = new Set(Object.values(ClothingSizesEnum));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const str = (val: unknown) => (val != null ? String(val).trim() : '');

      const dni = str(row.DNI).replace(/\D/g, '');
      if (!dni) {
        errors.push({ row: rowNum, message: 'DNI vacío' });
        continue;
      }

      try {
        const player = await this.playerModel.findOne({ idNumber: dni });
        if (!player) {
          const name =
            [str(row.Apellido), str(row.Nombre)].filter(Boolean).join(', ') ||
            '—';
          notFound.push({ row: rowNum, dni, name });
          continue;
        }

        const phone = str(row.Telefono);
        if (phone) {
          player.address = {
            ...(player.address ?? { phoneNumber: '' }),
            phoneNumber: phone,
          };
        }

        const healthInsurance = str(row['Obra Social']);
        if (
          healthInsurance &&
          healthInsurance !== '-' &&
          healthInsurance !== '.'
        ) {
          player.medicalData = {
            ...(player.medicalData ?? {}),
            healthInsurance,
          };
        }

        const jersey = str(
          row['Talle Camiseta']
        ).toUpperCase() as ClothingSizesEnum;
        const shorts = str(
          row['Talle Short/Falda']
        ).toUpperCase() as ClothingSizesEnum;
        const hasJersey = validSizes.has(jersey);
        const hasShorts = validSizes.has(shorts);

        if (hasJersey || hasShorts) {
          player.clothingSizes = {
            ...(player.clothingSizes ?? {}),
            ...(hasJersey ? { jersey, sweater: jersey } : {}),
            ...(hasShorts ? { shorts, pants: shorts } : {}),
          };
        }

        const email = str(row['Correo Electrónico']);
        if (email && !player.email) {
          player.email = email;
        }

        await player.save();
        updated++;
      } catch (err) {
        errors.push({
          row: rowNum,
          message: `DNI ${dni}: ${(err as Error).message}`,
        });
      }
    }

    return { updated, notFound, errors };
  }

}
