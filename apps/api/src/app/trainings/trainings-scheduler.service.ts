import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TrainingScheduleEntity } from './schedules/schemas/training-schedule.entity';
import { TrainingSessionEntity } from './sessions/schemas/training-session.entity';
import { TrainingSessionsService } from './sessions/training-sessions.service';

@Injectable()
export class TrainingsSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TrainingsSchedulerService.name);

  constructor(
    @InjectModel(TrainingScheduleEntity.name)
    private readonly scheduleModel: Model<TrainingScheduleEntity>,
    @InjectModel(TrainingSessionEntity.name)
    private readonly sessionModel: Model<TrainingSessionEntity>,
    private readonly sessionsService: TrainingSessionsService,
  ) {}

  async onModuleInit() {
    await this.migrateSessionDates();
    await this.migrateScheduleDates();
    await this.deduplicateSessions();
    await this.generateUpcomingSessions();
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async autoCompletePastSessions() {
    const today = new Date().toISOString().slice(0, 10);
    const result = await this.sessionModel.updateMany(
      { status: 'scheduled', date: { $lt: today } },
      { $set: { status: 'completed' } }
    );
    if (result.modifiedCount > 0) {
      this.logger.log(`Auto-completed ${result.modifiedCount} past training sessions`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async generateUpcomingSessions() {
    this.logger.log('Generating upcoming training sessions...');
    const schedules = await this.scheduleModel.find({ isActive: true }).exec();
    for (const schedule of schedules) {
      await this.sessionsService.generateForSchedule(schedule.id);
    }
    this.logger.log(`Generated sessions for ${schedules.length} schedules`);
  }

  private async migrateSessionDates() {
    const sessions = await this.sessionModel.find({}).lean().exec();
    let migrated = 0;
    for (const session of sessions) {
      const dateVal = (session as any).date;
      if (dateVal instanceof Date) {
        const dateStr = dateVal.toISOString().slice(0, 10);
        await this.sessionModel.updateOne({ _id: session._id }, { $set: { date: dateStr } });
        migrated++;
      }
    }
    if (migrated > 0) {
      this.logger.log(`Migrated ${migrated} session dates from Date to string`);
    }
  }

  /**
   * One-time cleanup of duplicate sessions created before the unique
   * (schedule, date, startTime) index existed. Keeps the session with the
   * most attendance data recorded; ties broken by oldest _id.
   */
  private async deduplicateSessions() {
    const duplicateGroups = await this.sessionModel.aggregate([
      { $match: { schedule: { $exists: true } } },
      {
        $group: {
          _id: { schedule: '$schedule', date: '$date', startTime: '$startTime' },
          ids: { $push: '$_id' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    if (duplicateGroups.length === 0) return;

    let removed = 0;
    for (const group of duplicateGroups) {
      const sessions = await this.sessionModel
        .find({ _id: { $in: group.ids } })
        .sort({ _id: 1 })
        .exec();

      const [keep, ...rest] = [...sessions].sort((a, b) => {
        const attendanceDiff = (b.attendance?.length ?? 0) - (a.attendance?.length ?? 0);
        if (attendanceDiff !== 0) return attendanceDiff;
        return a._id.toString() < b._id.toString() ? -1 : 1;
      });

      if (!keep) continue;
      const idsToRemove = rest.map((s) => s._id);
      await this.sessionModel.deleteMany({ _id: { $in: idsToRemove } });
      removed += idsToRemove.length;
    }

    if (removed > 0) {
      this.logger.log(`Removed ${removed} duplicate training sessions`);
    }
  }

  private async migrateScheduleDates() {
    const schedules = await this.scheduleModel.find({}).lean().exec();
    let migrated = 0;
    for (const schedule of schedules) {
      const updates: Record<string, string> = {};
      const validFrom = (schedule as any).validFrom;
      const validUntil = (schedule as any).validUntil;
      if (validFrom instanceof Date) {
        updates['validFrom'] = validFrom.toISOString().slice(0, 10);
      }
      if (validUntil instanceof Date) {
        updates['validUntil'] = validUntil.toISOString().slice(0, 10);
      }
      if (Object.keys(updates).length > 0) {
        await this.scheduleModel.updateOne({ _id: schedule._id }, { $set: updates });
        migrated++;
      }
    }
    if (migrated > 0) {
      this.logger.log(`Migrated ${migrated} schedule dates from Date to string`);
    }
  }
}
