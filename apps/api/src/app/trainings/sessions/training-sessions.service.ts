import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { File as MulterFile } from 'multer';
import { GridFsService } from '../../shared/gridfs/gridfs.service';
import { TrainingSessionEntity } from './schemas/training-session.entity';
import { TrainingScheduleEntity } from '../schedules/schemas/training-schedule.entity';
import { MatchEntity } from '../../matches/schemas/match.entity';
import { PaginationDto } from '../../shared/pagination.dto';
import { TrainingSessionFiltersDto } from './training-session-filter.dto';
import {
  AttendanceReportResponse,
  AttendanceStatusEnum,
  BlockEnum,
  CATEGORY_AGE_RANK,
  CategoryEnum,
  MatchStatusEnum,
  PaginatedResponse,
  PlayerStatusEnum,
  RoleEnum,
  SportEnum,
  TrainingSessionStatusEnum,
  UpcomingTraining,
  DayOfWeekEnum,
  getBlockCategories,
} from '@ltrc-campo/shared-api-model';
import { toMatchDateRange, toTrainingDateRange } from './attendance-report-date.util';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { User } from '../../users/schemas/user.schema';
import { PlayerEntity } from '../../players/schemas/player.entity';

const STAFF_ROLES: RoleEnum[] = [
  RoleEnum.COACH,
  RoleEnum.TRAINER,
  RoleEnum.MANAGER,
  RoleEnum.ANALYST,
];

const POPULATE_FIELDS = ['schedule', { path: 'attendance.player' }];

export const DAY_INDEX: Record<DayOfWeekEnum, number> = {
  [DayOfWeekEnum.SUNDAY]: 0,
  [DayOfWeekEnum.MONDAY]: 1,
  [DayOfWeekEnum.TUESDAY]: 2,
  [DayOfWeekEnum.WEDNESDAY]: 3,
  [DayOfWeekEnum.THURSDAY]: 4,
  [DayOfWeekEnum.FRIDAY]: 5,
  [DayOfWeekEnum.SATURDAY]: 6,
};

export function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class TrainingSessionsService {
  constructor(
    @InjectModel(TrainingSessionEntity.name)
    private readonly sessionModel: Model<TrainingSessionEntity>,
    @InjectModel(TrainingScheduleEntity.name)
    private readonly scheduleModel: Model<TrainingScheduleEntity>,
    @InjectModel(PlayerEntity.name)
    private readonly playerModel: Model<PlayerEntity>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(MatchEntity.name)
    private readonly matchModel: Model<MatchEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly gridFsService: GridFsService,
  ) {}

  private get checkinSecret(): string {
    return (
      this.configService.get<string>('AUTH_JWT_SECRET') ||
      this.configService.get<string>('GOOGLE_AUTH_JWT_SECRET') ||
      'super-secret-key'
    );
  }

  /**
   * Generates a short-lived QR token for check-in. Only staff can call this.
   * Valid ±30 min from the session's scheduled start time.
   */
  async generateCheckinToken(sessionId: string): Promise<{ token: string; validFrom: string; validUntil: string }> {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Training session not found');

    const sessionStart = new Date(`${session.date}T${session.startTime}:00-03:00`);
    const validFrom = new Date(sessionStart.getTime() - 30 * 60 * 1000);
    const validUntil = new Date(sessionStart.getTime() + 30 * 60 * 1000);

    const token = this.jwtService.sign(
      {
        sub: sessionId,
        type: 'checkin',
        validFrom: validFrom.toISOString(),
        validUntil: validUntil.toISOString(),
      },
      { secret: this.checkinSecret, expiresIn: '90m' }
    );

    return { token, validFrom: validFrom.toISOString(), validUntil: validUntil.toISOString() };
  }

  /**
   * Player checks in via QR token. Marks status PRESENT and confirmed.
   */
  async checkin(sessionId: string, token: string, caller: User): Promise<void> {
    let payload: { sub: string; type: string; validFrom: string; validUntil: string };
    try {
      payload = this.jwtService.verify(token, { secret: this.checkinSecret });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    if (payload.type !== 'checkin' || payload.sub !== sessionId) {
      throw new UnauthorizedException('Token inválido para esta sesión');
    }

    const now = new Date();
    if (now < new Date(payload.validFrom)) {
      throw new BadRequestException('El QR todavía no está activo');
    }
    if (now > new Date(payload.validUntil)) {
      throw new BadRequestException('El QR expiró');
    }

    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Training session not found');

    const player = await this.playerModel.findOne({ userId: String(caller._id) }).exec();
    if (!player) throw new BadRequestException('No se encontró un jugador vinculado a tu cuenta');

    const existing = session.attendance.find(
      (a) => !a.isStaff && a.player?.toString() === player._id.toString()
    );

    if (existing?.status === 'present' as any) {
      throw new BadRequestException('Ya registraste tu asistencia para esta sesión');
    }

    const checkinAt = new Date();
    if (existing) {
      existing.status = 'present' as any;
      existing.markedAt = checkinAt;
      existing.markedBy = String(caller._id);
    } else {
      session.attendance.push({
        player: player._id as any,
        isStaff: false,
        status: 'present' as any,
        confirmed: false,
        markedAt: checkinAt,
        markedBy: String(caller._id),
      } as any);
    }

    await session.save();
  }

  async create(dto: CreateTrainingSessionDto, caller?: User) {
    const callerId = caller ? (caller as any)._id : undefined;
    return this.sessionModel.create({
      ...(dto as any),
      createdBy: callerId,
      updatedBy: callerId,
    });
  }

  async findPaginated(
    pagination: PaginationDto<TrainingSessionFiltersDto>,
    caller?: User
  ): Promise<PaginatedResponse<unknown>> {
    const { page, size, filters = {}, sortBy, sortOrder = 'asc' } = pagination;
    const skip = (page - 1) * size;

    const queryFilters: Record<string, unknown> = {};

    if (filters.sport) queryFilters['sport'] = filters.sport;
    if (filters.category) queryFilters['category'] = filters.category;
    if (filters.status) queryFilters['status'] = filters.status;
    if (filters.location) queryFilters['location'] = { $regex: filters.location, $options: 'i' };

    if (filters.fromDate || filters.toDate) {
      const dateFilter: Record<string, string> = {};
      if (filters.fromDate) dateFilter['$gte'] = filters.fromDate;
      if (filters.toDate) dateFilter['$lte'] = filters.toDate;
      queryFilters['date'] = dateFilter;
    }

    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      let sports = caller.sports ?? [];
      let categories = caller.categories ?? [];

      // Fall back to linked player's sport/category
      if (!sports.length || !categories.length) {
        const player = await this.playerModel
          .findOne({ userId: String(caller._id) })
          .exec();
        if (!sports.length && player?.sport) sports = [player.sport];
        if (!categories.length && player?.category)
          categories = [player.category];
      }

      if (sports.length) queryFilters['sport'] = { $in: sports };
      if (categories.length) queryFilters['category'] = { $in: categories };
    }

    const [items, total] = await Promise.all([
      sortBy
        ? this.sessionModel
            .find(queryFilters)
            .skip(skip)
            .limit(size)
            .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, startTime: 1 })
            .populate(POPULATE_FIELDS)
            .exec()
        : this.findSortedByProximity(queryFilters, skip, size),
      this.sessionModel.countDocuments(queryFilters).exec(),
    ]);

    return { items, total, page, size };
  }

  private async findSortedByProximity(
    queryFilters: Record<string, unknown>,
    skip: number,
    size: number
  ) {
    // Use Argentina timezone offset (UTC-3) to determine today's date server-side
    const nowUtc = new Date();
    const AR_OFFSET_MS = -3 * 60 * 60 * 1000;
    const nowAr = new Date(nowUtc.getTime() + AR_OFFSET_MS);
    const todayStr = nowAr.toISOString().slice(0, 10);

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
          // 0 = today/future, 1 = past — sort date string directly (local time, no TZ issues)
          _isPast: {
            $cond: [{ $lt: ['$date', todayStr] }, 1, 0],
          },
          _categoryRank: categoryRankSwitch,
        },
      },
      // today+future: date ASC, startTime ASC, category ASC, location ASC
      // past: date DESC (most recent first), same secondary sorts
      { $sort: { _isPast: 1, date: 1, startTime: 1, _categoryRank: 1, location: 1 } },
      { $skip: skip },
      { $limit: size },
      { $project: { _isPast: 0, _categoryRank: 0 } },
    ];

    const rawItems = await this.sessionModel.aggregate(pipeline).exec();
    const items = await this.sessionModel.populate(
      rawItems,
      POPULATE_FIELDS as any
    );
    return items.map((m: any) => {
      if (!m.id && m._id) m.id = m._id.toString();
      return m;
    });
  }

  async findOne(id: string) {
    const session = await this.sessionModel
      .findById(id)
      .populate(POPULATE_FIELDS);
    if (!session) throw new NotFoundException('Training session not found');
    return session;
  }

  async update(id: string, dto: UpdateTrainingSessionDto, caller?: User) {
    const session = await this.sessionModel.findById(id);
    if (!session) throw new NotFoundException('Training session not found');

    // If date changes on a schedule-linked session, protect the original slot
    // so the scheduler doesn't regenerate it
    if (dto.date && dto.date !== (session.date as unknown as string) && session.schedule) {
      await this.sessionModel.findOneAndUpdate(
        { schedule: session.schedule, date: session.date },
        {
          $setOnInsert: {
            startTime: session.startTime,
            endTime: session.endTime,
            sport: session.sport,
            category: session.category,
            status: TrainingSessionStatusEnum.CANCELLED,
            attendance: [],
          },
        },
        { upsert: true }
      );
      // Detach from schedule — this session is now a one-off
      await this.sessionModel.findByIdAndUpdate(id, { $unset: { schedule: '' } });
      session.set('schedule', undefined);
    }

    Object.assign(session, dto);
    if (caller) session.updatedBy = (caller as any)._id;
    return session.save();
  }

  async delete(id: string) {
    const session = await this.sessionModel.findById(id);
    if (!session) throw new NotFoundException('Training session not found');
    // Soft-delete: mark as CANCELLED so the scheduler doesn't recreate it on restart
    if (session.schedule) {
      session.status = TrainingSessionStatusEnum.CANCELLED;
      return session.save();
    }
    return session.deleteOne();
  }

  /**
   * Get upcoming sessions for the current user.
   * All sessions come from the DB (pre-generated by the scheduler).
   */
  async getUpcomingForUser(
    caller: User,
    days = 7,
    todayStr?: string
  ): Promise<UpcomingTraining[]> {
    const from = todayStr ?? new Date().toISOString().slice(0, 10);
    const toDate = new Date(from + 'T12:00:00Z');
    toDate.setDate(toDate.getDate() + days);
    const to = toDate.toISOString().slice(0, 10);

    // Find player linked to user (if any — for filtering & self-confirmation)
    const player = await this.playerModel
      .findOne({ userId: String(caller._id) })
      .exec();

    const userId = String(caller._id);

    const scopeFilter: Record<string, unknown> = {};

    if (!caller.roles?.includes(RoleEnum.ADMIN)) {
      // Resolve sports/categories: prefer user-level, fall back to linked player
      const sports = caller.sports?.length
        ? caller.sports
        : player?.sport
        ? [player.sport]
        : [];
      const categories = caller.categories?.length
        ? caller.categories
        : player?.category
        ? [player.category]
        : [];

      if (sports.length) scopeFilter['sport'] = { $in: sports };
      if (categories.length) scopeFilter['category'] = { $in: categories };
    }

    const sessions = await this.sessionModel
      .find({
        date: { $gte: from, $lte: to },
        status: { $ne: TrainingSessionStatusEnum.CANCELLED },
        ...scopeFilter,
      })
      .sort({ date: 1, startTime: 1 })
      .exec();

    return sessions.map((session) => ({
      sessionId: session.id,
      date: session.date as unknown as string,
      startTime: session.startTime,
      endTime: session.endTime,
      sport: session.sport,
      category: session.category,
      division: session.division,
      location: session.location,
      status: session.status,
      confirmations: session.attendance.filter((a) => a.confirmed).length,
      confirmed: session.attendance.some(
        (a) =>
          a.confirmed &&
          ((player && a.player?.toString() === player._id.toString()) ||
            a.user === userId)
      ),
    }));
  }

  /**
   * Update sport/category/division on existing SCHEDULED future sessions for a given schedule.
   * Called when a schedule is edited so existing sessions reflect the new values.
   */
  async updateScheduledSessions(
    scheduleId: string,
    fromDate: string,
    fields: { sport?: string; category?: string; division?: string }
  ) {
    const update: Record<string, unknown> = {};
    if (fields.sport !== undefined) update['sport'] = fields.sport;
    if (fields.category !== undefined) update['category'] = fields.category;
    if (fields.division !== undefined) update['division'] = fields.division;
    if (!Object.keys(update).length) return;
    await this.sessionModel.updateMany(
      {
        schedule: scheduleId,
        date: { $gte: fromDate },
        status: TrainingSessionStatusEnum.SCHEDULED,
      },
      { $set: update }
    );
  }

  /**
   * Generate sessions for a schedule and persist to DB.
   * Idempotent via upsert. Used by the scheduler cron and on schedule create/update.
   */
  async generateForSchedule(
    scheduleId: string,
    fromDateStr?: string,
    toDateStr?: string
  ) {
    const schedule = await this.scheduleModel.findById(scheduleId);
    if (!schedule || !schedule.isActive) return;

    const from = fromDateStr ?? new Date().toISOString().slice(0, 10);
    const toDate = new Date((toDateStr ?? from) + 'T12:00:00Z');
    if (!toDateStr) toDate.setDate(toDate.getDate() + 30);
    const to = toDate.toISOString().slice(0, 10);

    for (const slot of schedule.timeSlots) {
      let current = from;
      while (current <= to) {
        const d = new Date(current + 'T12:00:00Z');
        if (DAY_INDEX[slot.day] === d.getUTCDay()) {
          // Check validFrom/validUntil using string comparison
          if (schedule.validUntil && current > schedule.validUntil) break;
          if (schedule.validFrom && current < schedule.validFrom) {
            current = nextDay(current);
            continue;
          }
          await this.sessionModel.findOneAndUpdate(
            { schedule: schedule._id, date: current, startTime: slot.startTime },
            {
              $setOnInsert: {
                startTime: slot.startTime,
                endTime: slot.endTime,
                sport: schedule.sport,
                category: schedule.category,
                division: schedule.division,
                location: slot.location,
                status: TrainingSessionStatusEnum.SCHEDULED,
                attendance: [],
              },
            },
            { upsert: true, returnDocument: 'after' }
          );
        }
        current = nextDay(current);
      }
    }

    // Update generatedUntil watermark
    await this.scheduleModel.findByIdAndUpdate(scheduleId, {
      generatedUntil: to,
    });
  }

  /**
   * Player/staff confirms attendance.
   */
  async confirmAttendance(sessionId: string, caller: User) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Training session not found');

    // Only field roles can confirm attendance
    const fieldRoles = [
      RoleEnum.PLAYER,
      RoleEnum.COACH,
      RoleEnum.TRAINER,
      RoleEnum.MANAGER,
    ];
    const hasFieldRole = (caller.roles ?? []).some((r) =>
      fieldRoles.includes(r as RoleEnum)
    );
    if (!hasFieldRole) {
      throw new BadRequestException(
        'Solo usuarios con rol de cancha pueden confirmar asistencia'
      );
    }

    // Determine if caller is staff or player
    const player = await this.playerModel
      .findOne({ userId: String(caller._id) })
      .exec();
    const isStaff = !player;

    // Check if already confirmed
    const existing = session.attendance.find((a) => {
      if (isStaff) return a.user === String(caller._id);
      return a.player?.toString() === player!._id.toString();
    });

    if (existing) {
      existing.confirmed = true;
      existing.confirmedAt = new Date();
    } else {
      const entry: any = {
        isStaff,
        confirmed: true,
        confirmedAt: new Date(),
      };
      if (isStaff) {
        entry.user = String(caller._id);
        entry.userName = caller.name;
      } else {
        entry.player = player!._id;
      }
      session.attendance.push(entry);
    }

    await session.save();
    return session.populate(POPULATE_FIELDS);
  }

  /**
   * Cancel confirmation.
   */
  async cancelConfirmation(sessionId: string, caller: User) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Training session not found');

    const player = await this.playerModel
      .findOne({ userId: String(caller._id) })
      .exec();
    const isStaff = !player;

    const entry = session.attendance.find((a) => {
      if (isStaff) return a.user === String(caller._id);
      return a.player?.toString() === player!._id.toString();
    });

    if (entry) {
      entry.confirmed = false;
      entry.confirmedAt = undefined;
    }

    await session.save();
    return session.populate(POPULATE_FIELDS);
  }

  /**
   * Coach/PF records attendance (bulk).
   */
  async recordAttendance(
    sessionId: string,
    dto: RecordAttendanceDto,
    callerId: string
  ) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Training session not found');

    const now = new Date();

    for (const record of dto.records) {
      let existing: any;

      if (record.isStaff && record.userId) {
        existing = session.attendance.find(
          (a) => a.isStaff && a.user === record.userId
        );
        if (!existing) {
          existing = {
            user: record.userId,
            userName: record.userName,
            isStaff: true,
            confirmed: false,
          };
          session.attendance.push(existing);
          existing = session.attendance[session.attendance.length - 1];
        }
      } else if (record.playerId) {
        existing = session.attendance.find(
          (a) => !a.isStaff && a.player?.toString() === record.playerId
        );
        if (!existing) {
          existing = {
            player: record.playerId as any,
            isStaff: false,
            confirmed: false,
          };
          session.attendance.push(existing);
          existing = session.attendance[session.attendance.length - 1];
        }
      }

      if (existing) {
        if (record.status !== undefined) {
          existing.status = record.status ?? undefined;
          existing.markedAt = record.status ? now : undefined;
          existing.markedBy = record.status ? callerId : undefined;
        }
        if (record.confirmed !== undefined) {
          existing.confirmed = record.confirmed;
          existing.confirmedAt = record.confirmed ? now : undefined;
        }
      }
    }

    await session.save();
    return session.populate(POPULATE_FIELDS);
  }

  async getAttendanceStats(
    caller?: User,
    filters?: { sport?: string; category?: string },
  ): Promise<{
    byCategory: Record<
      string,
      {
        sessions: number;
        totalPresent: number;
        totalAttendees: number;
        pct: number;
      }
    >;
  }> {
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date();
    since.setDate(since.getDate() - 28);
    const sinceStr = since.toISOString().slice(0, 10);

    const scopeFilter: Record<string, unknown> = {
      date: { $lte: today, $gte: sinceStr },
    };
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      const sports = caller.sports ?? [];
      const categories = caller.categories ?? [];
      if (sports.length) scopeFilter['sport'] = { $in: sports };
      if (categories.length) scopeFilter['category'] = { $in: categories };
    }
    // Additional filters from query params (must be within caller's allowed scope)
    if (filters?.sport) scopeFilter['sport'] = filters.sport;
    if (filters?.category) scopeFilter['category'] = filters.category;

    const sessions = await this.sessionModel.find(scopeFilter).lean();

    const stats: Record<
      string,
      { sessions: number; totalPresent: number; totalAttendees: number }
    > = {};
    for (const s of sessions) {
      const cat = s.category as string;
      if (!stats[cat])
        stats[cat] = { sessions: 0, totalPresent: 0, totalAttendees: 0 };
      stats[cat].sessions++;
      const playerAttendance = (s.attendance ?? []).filter(
        (a: any) => !a.isStaff
      );
      stats[cat].totalAttendees += playerAttendance.length;
      stats[cat].totalPresent += playerAttendance.filter(
        (a: any) => a.status === 'present'
      ).length;
    }

    const byCategory: Record<
      string,
      {
        sessions: number;
        totalPresent: number;
        totalAttendees: number;
        pct: number;
      }
    > = {};
    for (const [cat, data] of Object.entries(stats)) {
      byCategory[cat] = {
        ...data,
        pct:
          data.totalAttendees > 0
            ? Math.round((data.totalPresent / data.totalAttendees) * 100)
            : 0,
      };
    }

    return { byCategory };
  }

  private isoWeekKey(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00Z');
    const year = d.getUTCFullYear();
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getUTCDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  private generateWeekLabels(weeks: number): string[] {
    const labels: string[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      const key = this.isoWeekKey(d.toISOString().slice(0, 10));
      if (!labels.includes(key)) labels.push(key);
    }
    return labels;
  }

  private readonly NON_COMPETITIVE_CATS = [
    ...getBlockCategories(BlockEnum.INFANTILES),
    ...getBlockCategories(BlockEnum.CADETES),
  ];

  private readonly COMPETITIVE_CATS = [
    ...getBlockCategories(BlockEnum.JUVENILES),
    ...getBlockCategories(BlockEnum.MAYORES),
    ...getBlockCategories(BlockEnum.PLANTEL_SUPERIOR),
  ];

  async getAttendanceTrend(
    caller?: User,
    filters?: { sport?: string; category?: string; period?: string; categoryGroup?: 'competitive' | 'non-competitive' },
  ): Promise<{ labels: string[]; sessions: number[]; present: number[]; attendees: number[]; pct: number[] }> {
    const weeks = filters?.period === '1m' ? 5 : filters?.period === '3m' ? 13 : 26;
    const since = new Date();
    since.setDate(since.getDate() - weeks * 7);

    const scopeFilter: Record<string, unknown> = {
      date: { $lte: new Date().toISOString().slice(0, 10), $gte: since.toISOString().slice(0, 10) },
    };
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      const sports = caller.sports ?? [];
      const categories = caller.categories ?? [];
      if (sports.length) scopeFilter['sport'] = { $in: sports };
      if (categories.length) scopeFilter['category'] = { $in: categories };
    }
    if (filters?.sport) scopeFilter['sport'] = filters.sport;
    if (filters?.category) scopeFilter['category'] = filters.category;
    if (filters?.categoryGroup === 'competitive') scopeFilter['category'] = { $in: this.COMPETITIVE_CATS };
    if (filters?.categoryGroup === 'non-competitive') scopeFilter['category'] = { $in: this.NON_COMPETITIVE_CATS };

    const sessions = await this.sessionModel.find(scopeFilter).lean();

    const buckets: Record<string, { sessions: number; present: number; attendees: number }> = {};
    for (const s of sessions) {
      const key = this.isoWeekKey(s.date);
      if (!buckets[key]) buckets[key] = { sessions: 0, present: 0, attendees: 0 };
      buckets[key].sessions++;
      const playerAtt = (s.attendance ?? []).filter((a: any) => !a.isStaff);
      buckets[key].attendees += playerAtt.length;
      buckets[key].present += playerAtt.filter((a: any) => a.status === 'present').length;
    }

    const labels = this.generateWeekLabels(weeks);
    return {
      labels,
      sessions: labels.map((l) => buckets[l]?.sessions ?? 0),
      present: labels.map((l) => buckets[l]?.present ?? 0),
      attendees: labels.map((l) => buckets[l]?.attendees ?? 0),
      pct: labels.map((l) => {
        const b = buckets[l];
        return b && b.attendees > 0 ? Math.round((b.present / b.attendees) * 100) : 0;
      }),
    };
  }

  async getParticipationOverlap(
    caller?: User,
    filters?: { sport?: string; period?: string },
  ): Promise<{ labels: string[]; trainOnly: number[]; matchOnly: number[]; both: number[] }> {
    const weeks = filters?.period === '1m' ? 5 : filters?.period === '3m' ? 13 : 26;
    const since = new Date();
    since.setDate(since.getDate() - weeks * 7);
    const sinceStr = since.toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    const scopeFilter: Record<string, unknown> = {
      category: { $in: this.NON_COMPETITIVE_CATS },
    };
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      const sports = caller.sports ?? [];
      if (sports.length) scopeFilter['sport'] = { $in: sports };
    }
    if (filters?.sport) scopeFilter['sport'] = filters.sport;

    const [sessions, matches] = await Promise.all([
      this.sessionModel.find({ ...scopeFilter, date: { $gte: sinceStr, $lte: todayStr } }).lean(),
      this.matchModel.find({ ...scopeFilter, date: { $gte: new Date(sinceStr), $lte: new Date() } }).lean(),
    ]);

    // Build weekly buckets: Set of playerIds per week for training and matches
    const trainWeek: Record<string, Set<string>> = {};
    for (const s of sessions) {
      const key = this.isoWeekKey(s.date);
      if (!trainWeek[key]) trainWeek[key] = new Set();
      for (const a of (s.attendance ?? []).filter((a: any) => !a.isStaff && a.status === 'present')) {
        trainWeek[key].add(a.player?.toString());
      }
    }

    const matchWeek: Record<string, Set<string>> = {};
    for (const m of matches) {
      const key = this.isoWeekKey(new Date(m.date).toISOString().slice(0, 10));
      if (!matchWeek[key]) matchWeek[key] = new Set();
      for (const a of (m.attendance ?? []).filter((a: any) => !a.isStaff && a.status === 'present')) {
        matchWeek[key].add(a.player?.toString());
      }
    }

    const labels = this.generateWeekLabels(weeks);
    return {
      labels,
      trainOnly: labels.map((l) => {
        const t = trainWeek[l] ?? new Set();
        const mm = matchWeek[l] ?? new Set();
        return [...t].filter((id) => !mm.has(id)).length;
      }),
      matchOnly: labels.map((l) => {
        const t = trainWeek[l] ?? new Set();
        const mm = matchWeek[l] ?? new Set();
        return [...mm].filter((id) => !t.has(id)).length;
      }),
      both: labels.map((l) => {
        const t = trainWeek[l] ?? new Set();
        const mm = matchWeek[l] ?? new Set();
        return [...t].filter((id) => mm.has(id)).length;
      }),
    };
  }

  async getNonCompetitiveByCategory(
    caller?: User,
    filters?: { sport?: string; period?: string },
  ): Promise<{ categories: { category: string; labels: string[]; trainOnly: number[]; both: number[]; matchOnly: number[]; trainPresent: number[]; trainAttendees: number[]; matchPresent: number[]; matchAttendees: number[] }[] }> {
    const weeks = filters?.period === '1m' ? 5 : filters?.period === '3m' ? 13 : 26;
    const since = new Date();
    since.setDate(since.getDate() - weeks * 7);
    const sinceStr = since.toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    const scopeFilter: Record<string, unknown> = {
      category: { $in: this.NON_COMPETITIVE_CATS },
    };
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      const sports = caller.sports ?? [];
      if (sports.length) scopeFilter['sport'] = { $in: sports };
    }
    if (filters?.sport) scopeFilter['sport'] = filters.sport;

    const [sessions, matches] = await Promise.all([
      this.sessionModel.find({ ...scopeFilter, date: { $gte: sinceStr, $lte: todayStr } }).lean(),
      this.matchModel.find({ ...scopeFilter, date: { $gte: new Date(sinceStr), $lte: new Date() } }).lean(),
    ]);

    const labels = this.generateWeekLabels(weeks);

    // Aggregate per-category, per-week
    type WeekBucket = { trainPlayerIds: Set<string>; matchPlayerIds: Set<string>; trainPresent: number; trainAttendees: number; matchPresent: number; matchAttendees: number };
    const catWeek: Record<string, Record<string, WeekBucket>> = {};

    for (const s of sessions) {
      const cat = s.category as string;
      const key = this.isoWeekKey(s.date);
      if (!catWeek[cat]) catWeek[cat] = {};
      if (!catWeek[cat][key]) catWeek[cat][key] = { trainPlayerIds: new Set(), matchPlayerIds: new Set(), trainPresent: 0, trainAttendees: 0, matchPresent: 0, matchAttendees: 0 };
      const b = catWeek[cat][key];
      const playerAtt = (s.attendance ?? []).filter((a: any) => !a.isStaff);
      b.trainAttendees += playerAtt.length;
      for (const a of playerAtt) {
        if (a.status === 'present') {
          b.trainPresent++;
          if (a.player) b.trainPlayerIds.add(a.player.toString());
        }
      }
    }

    for (const m of matches) {
      const cat = m.category as string;
      const key = this.isoWeekKey(new Date(m.date).toISOString().slice(0, 10));
      if (!catWeek[cat]) catWeek[cat] = {};
      if (!catWeek[cat][key]) catWeek[cat][key] = { trainPlayerIds: new Set(), matchPlayerIds: new Set(), trainPresent: 0, trainAttendees: 0, matchPresent: 0, matchAttendees: 0 };
      const b = catWeek[cat][key];
      const playerAtt = (m.attendance ?? []).filter((a: any) => !a.isStaff);
      b.matchAttendees += playerAtt.length;
      for (const a of playerAtt) {
        if (a.status === 'present') {
          b.matchPresent++;
          if (a.player) b.matchPlayerIds.add(a.player.toString());
        }
      }
    }

    // Only include categories that have actual data
    const categoriesWithData = this.NON_COMPETITIVE_CATS.filter((cat) => catWeek[cat]);

    const result = categoriesWithData.map((cat) => {
      const weekData = catWeek[cat] ?? {};
      return {
        category: cat,
        labels,
        trainOnly: labels.map((l) => {
          const b = weekData[l];
          if (!b) return 0;
          return [...b.trainPlayerIds].filter((id) => !b.matchPlayerIds.has(id)).length;
        }),
        both: labels.map((l) => {
          const b = weekData[l];
          if (!b) return 0;
          return [...b.trainPlayerIds].filter((id) => b.matchPlayerIds.has(id)).length;
        }),
        matchOnly: labels.map((l) => {
          const b = weekData[l];
          if (!b) return 0;
          return [...b.matchPlayerIds].filter((id) => !b.trainPlayerIds.has(id)).length;
        }),
        trainPresent: labels.map((l) => weekData[l]?.trainPresent ?? 0),
        trainAttendees: labels.map((l) => weekData[l]?.trainAttendees ?? 0),
        matchPresent: labels.map((l) => weekData[l]?.matchPresent ?? 0),
        matchAttendees: labels.map((l) => weekData[l]?.matchAttendees ?? 0),
      };
    });

    return { categories: result };
  }

  async getAttendanceReport(
    caller: User | undefined,
    filters: {
      sport?: string;
      category?: string;
      playerId?: string;
      fromDate?: string;
      toDate?: string;
      type?: 'training' | 'match' | 'both';
    },
  ): Promise<AttendanceReportResponse> {
    const type = filters.type ?? 'both';

    let sports = filters.sport ? [filters.sport as SportEnum] : [];
    let categories = filters.category ? [filters.category as CategoryEnum] : [];

    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      let callerSports = caller.sports ?? [];
      let callerCategories = caller.categories ?? [];
      if (!callerSports.length || !callerCategories.length) {
        const player = await this.playerModel
          .findOne({ userId: String(caller._id) })
          .exec();
        if (!callerSports.length && player?.sport) callerSports = [player.sport];
        if (!callerCategories.length && player?.category) callerCategories = [player.category];
      }
      sports = sports.length
        ? sports.filter((s) => !callerSports.length || callerSports.includes(s))
        : callerSports;
      categories = categories.length
        ? categories.filter((c) => !callerCategories.length || callerCategories.includes(c))
        : callerCategories;
    }

    const emptyResult: AttendanceReportResponse = {
      players: [],
      meta: {
        sport: sports[0],
        category: categories[0],
        fromDate: filters.fromDate ?? '',
        toDate: filters.toDate ?? '',
        type,
      },
    };
    if (!sports.length) return emptyResult;

    const playerQuery: Record<string, unknown> = { sport: { $in: sports } };
    if (categories.length) playerQuery['category'] = { $in: categories };
    if (filters.playerId) playerQuery['_id'] = filters.playerId;
    else playerQuery['status'] = PlayerStatusEnum.ACTIVE;

    const players = await this.playerModel.find(playerQuery).sort({ name: 1 }).lean();
    if (!players.length) return emptyResult;

    const sessionDateRange = toTrainingDateRange(filters.fromDate, filters.toDate);
    const matchDateRange = toMatchDateRange(filters.fromDate, filters.toDate);

    const sessionScopeFilter: Record<string, unknown> = {
      sport: { $in: sports },
      status: { $ne: TrainingSessionStatusEnum.CANCELLED },
    };
    if (categories.length) sessionScopeFilter['category'] = { $in: categories };
    if (Object.keys(sessionDateRange).length) sessionScopeFilter['date'] = sessionDateRange;

    const matchScopeFilter: Record<string, unknown> = {
      sport: { $in: sports },
      status: { $ne: MatchStatusEnum.CANCELLED },
    };
    if (categories.length) matchScopeFilter['category'] = { $in: categories };
    if (Object.keys(matchDateRange).length) matchScopeFilter['date'] = matchDateRange;

    const [sessions, matches] = await Promise.all([
      type !== 'match' ? this.sessionModel.find(sessionScopeFilter).lean() : Promise.resolve([]),
      type !== 'training' ? this.matchModel.find(matchScopeFilter).lean() : Promise.resolve([]),
    ]);

    type Totals = { total: number; present: number; absent: number; justified: number };
    const emptyTotals = (): Totals => ({ total: 0, present: 0, absent: 0, justified: 0 });

    const trainingTotals = new Map<string, Totals>();
    const matchTotals = new Map<string, Totals>();
    const sessionsByPlayer = new Map<string, AttendanceReportResponse['players'][number]['sessions']>();
    for (const p of players) {
      const pid = (p._id as Types.ObjectId).toString();
      trainingTotals.set(pid, emptyTotals());
      matchTotals.set(pid, emptyTotals());
      sessionsByPlayer.set(pid, []);
    }

    const attendanceStatus = (
      entry: { status?: AttendanceStatusEnum } | undefined,
    ): 'present' | 'absent' | 'justified' => {
      if (entry?.status === AttendanceStatusEnum.PRESENT) return 'present';
      if (entry?.status === AttendanceStatusEnum.JUSTIFIED) return 'justified';
      return 'absent'; // no entry, or entry without a status, counts as absent
    };

    for (const s of sessions as any[]) {
      for (const p of players) {
        if (s.sport !== p.sport || s.category !== p.category) continue;
        const pid = (p._id as Types.ObjectId).toString();
        const totals = trainingTotals.get(pid)!;
        totals.total++;
        const entry = (s.attendance ?? []).find(
          (a: any) => !a.isStaff && a.player?.toString() === pid,
        );
        const status = attendanceStatus(entry);
        totals[status]++;
        sessionsByPlayer.get(pid)!.push({
          type: 'training',
          id: s._id.toString(),
          date: s.date,
          sport: s.sport,
          category: s.category,
          status,
          label: s.location,
        });
      }
    }

    for (const m of matches as any[]) {
      for (const p of players) {
        if (m.sport !== p.sport || m.category !== p.category) continue;
        const pid = (p._id as Types.ObjectId).toString();
        const totals = matchTotals.get(pid)!;
        totals.total++;
        const entry = (m.attendance ?? []).find(
          (a: any) => !a.isStaff && a.player?.toString() === pid,
        );
        const status = attendanceStatus(entry);
        totals[status]++;
        sessionsByPlayer.get(pid)!.push({
          type: 'match',
          id: m._id.toString(),
          date: new Date(m.date).toISOString().slice(0, 10),
          sport: m.sport,
          category: m.category,
          status,
          label: m.opponent,
        });
      }
    }

    const pct = (t: Totals) => (t.total > 0 ? Math.round((t.present / t.total) * 100) : 0);

    const resultPlayers = players.map((p) => {
      const pid = (p._id as Types.ObjectId).toString();
      const trainT = trainingTotals.get(pid)!;
      const matchT = matchTotals.get(pid)!;
      return {
        playerId: pid,
        playerName: p.name,
        sport: p.sport as SportEnum,
        category: p.category as CategoryEnum,
        training: { ...trainT, pct: pct(trainT) },
        match: { ...matchT, pct: pct(matchT) },
        sessions: sessionsByPlayer.get(pid)!.sort((a, b) => a.date.localeCompare(b.date)),
      };
    });

    return {
      players: resultPlayers,
      meta: {
        sport: sports[0],
        category: categories[0],
        fromDate: filters.fromDate ?? '',
        toDate: filters.toDate ?? '',
        type,
      },
    };
  }

  async addAttachment(
    sessionId: string,
    file: MulterFile,
    name?: string,
    visibility: 'all' | 'staff' | 'players' = 'all',
    targetPlayers?: string[]
  ) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Training session not found');

    const fileId = await this.gridFsService.uploadFile(
      'trainingAttachments',
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
    session.attachments = session.attachments ?? [];
    session.attachments.push(attachment as any);
    await session.save();

    return attachment;
  }

  async updateAttachment(
    sessionId: string,
    fileId: string,
    name: string,
    visibility: 'all' | 'staff' | 'players',
    targetPlayers?: string[]
  ) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Training session not found');

    const idx = (session.attachments ?? []).findIndex((a) => a.fileId === fileId);
    if (idx === -1) throw new NotFoundException('Attachment not found');

    (session.attachments![idx] as any).name = name;
    (session.attachments![idx] as any).visibility = visibility;
    (session.attachments![idx] as any).targetPlayers =
      targetPlayers?.map((id) => new Types.ObjectId(id)) ?? [];
    session.markModified('attachments');
    await session.save();

    return session.attachments![idx];
  }

  async getAttachmentStream(sessionId: string, fileId: string) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Training session not found');
    const att = session.attachments?.find((a) => a.fileId === fileId);
    if (!att) throw new NotFoundException('Attachment not found');
    return {
      stream: this.gridFsService.getFileStream('trainingAttachments', fileId),
      mimeType: att.mimeType,
      filename: att.filename,
    };
  }

  async deleteAttachment(sessionId: string, fileId: string) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Training session not found');
    const idx = session.attachments?.findIndex((a) => a.fileId === fileId) ?? -1;
    if (idx === -1) throw new NotFoundException('Attachment not found');

    await this.gridFsService.deleteFile('trainingAttachments', fileId);
    session.attachments.splice(idx, 1);
    await session.save();
  }

  /**
   * Returns staff users (coach/trainer/manager/analyst) relevant to this session's sport+category.
   */
  async getStaffForSession(
    sessionId: string
  ): Promise<{ id: string; name: string; roles: string[] }[]> {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Training session not found');

    const query: Record<string, any> = { roles: { $in: STAFF_ROLES } };
    // Include users with no sport/category restriction OR who match this session's sport+category
    query['$and'] = [
      {
        $or: [
          { sports: { $exists: false } },
          { sports: { $size: 0 } },
          { sports: session.sport },
        ],
      },
      {
        $or: [
          { categories: { $exists: false } },
          { categories: { $size: 0 } },
          { categories: session.category },
        ],
      },
    ];

    const users = await this.userModel
      .find(query)
      .select('_id name roles')
      .exec();
    return users.map((u) => ({
      id: (u as any)._id.toString(),
      name: u.name,
      roles: u.roles ?? [],
    }));
  }
}
