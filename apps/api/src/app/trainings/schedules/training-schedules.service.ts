import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TrainingScheduleEntity } from './schemas/training-schedule.entity';
import { PaginationDto } from '../../shared/pagination.dto';
import { TrainingScheduleFiltersDto } from './training-schedule-filter.dto';
import {
  CATEGORY_AGE_RANK,
  PaginatedResponse,
  RoleEnum,
} from '@ltrc-campo/shared-api-model';
import { CreateTrainingScheduleDto } from './dto/create-training-schedule.dto';
import { UpdateTrainingScheduleDto } from './dto/update-training-schedule.dto';
import { User } from '../../users/schemas/user.schema';
import { TrainingSessionsService } from '../sessions/training-sessions.service';

@Injectable()
export class TrainingSchedulesService {
  constructor(
    @InjectModel(TrainingScheduleEntity.name)
    private readonly scheduleModel: Model<TrainingScheduleEntity>,
    private readonly sessionsService: TrainingSessionsService,
  ) {}

  async create(dto: CreateTrainingScheduleDto, caller?: User) {
    const callerId = caller ? (caller as any)._id : undefined;
    const schedule = await this.scheduleModel.create({ ...(dto as any), createdBy: callerId, updatedBy: callerId });
    // Generate sessions for the next 30 days after creation
    await this.sessionsService.generateForSchedule(schedule.id);
    return schedule;
  }

  async findPaginated(
    pagination: PaginationDto<TrainingScheduleFiltersDto>,
    caller?: User
  ): Promise<PaginatedResponse<unknown>> {
    const { page, size, filters = {}, sortBy, sortOrder = 'asc' } = pagination;
    const skip = (page - 1) * size;

    const queryFilters: Record<string, unknown> = {};

    if (filters.sport) queryFilters['sport'] = filters.sport;
    if (filters.category) queryFilters['category'] = filters.category;
    if (filters.isActive !== undefined)
      queryFilters['isActive'] = filters.isActive;

    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      if (caller.sports?.length) queryFilters['sport'] = { $in: caller.sports };
      if (caller.categories?.length)
        queryFilters['category'] = { $in: caller.categories };
    }

    const [items, total] = await Promise.all([
      this.findSortedByCategory(queryFilters, skip, size),
      this.scheduleModel.countDocuments(queryFilters).exec(),
    ]);

    return { items, total, page, size };
  }

  private async findSortedByCategory(
    queryFilters: Record<string, unknown>,
    skip: number,
    size: number,
  ) {
    const categoryRankSwitch = {
      $switch: {
        branches: Object.entries(CATEGORY_AGE_RANK).map(([cat, rank]) => ({
          case: { $eq: ['$category', cat] },
          then: rank,
        })),
        default: 99,
      },
    };

    return this.scheduleModel.aggregate([
      { $match: queryFilters },
      { $addFields: { _categoryRank: categoryRankSwitch, id: { $toString: '$_id' } } },
      { $sort: { sport: 1, _categoryRank: 1 } },
      { $skip: skip },
      { $limit: size },
      { $project: { _categoryRank: 0 } },
    ]).exec();
  }

  async findOne(id: string) {
    const schedule = await this.scheduleModel.findById(id);
    if (!schedule) throw new NotFoundException('Training schedule not found');
    return schedule;
  }

  async update(id: string, dto: UpdateTrainingScheduleDto, caller?: User) {
    const schedule = await this.scheduleModel.findById(id);
    if (!schedule) throw new NotFoundException('Training schedule not found');
    Object.assign(schedule, dto);
    if (caller) schedule.updatedBy = (caller as any)._id;
    const saved = await schedule.save();
    // Regenerate future sessions from today onwards
    const today = new Date().toISOString().slice(0, 10);
    await this.sessionsService.updateScheduledSessions(saved.id, today, {
      sport: saved.sport,
      category: saved.category,
      division: saved.division,
    });
    await this.sessionsService.generateForSchedule(saved.id, today);
    return saved;
  }

  async duplicate(id: string, caller?: User) {
    const original = await this.scheduleModel.findById(id).lean();
    if (!original) throw new NotFoundException('Training schedule not found');
    const callerId = caller ? (caller as any)._id : undefined;
    const { _id, __v, createdAt, updatedAt, ...rest } = original as any;
    const copy = await this.scheduleModel.create({
      ...rest,
      isActive: false,
      createdBy: callerId,
      updatedBy: callerId,
    });
    return copy;
  }

  async delete(id: string) {
    const schedule = await this.scheduleModel.findById(id);
    if (!schedule) throw new NotFoundException('Training schedule not found');
    return schedule.deleteOne();
  }

  async getFieldOptions() {
    const locations = await this.scheduleModel
      .distinct('timeSlots.location')
      .then((vals) => vals.filter(Boolean));
    return { locations };
  }
}
