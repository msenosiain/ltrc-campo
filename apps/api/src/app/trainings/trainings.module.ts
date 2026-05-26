import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GridFsModule } from '../shared/gridfs/gridfs.module';
import { TrainingScheduleEntity } from './schedules/schemas/training-schedule.entity';
import { TrainingScheduleSchema } from './schedules/schemas/training-schedule.schema';
import { TrainingSessionEntity } from './sessions/schemas/training-session.entity';
import { TrainingSessionSchema } from './sessions/schemas/training-session.schema';
import { TrainingSchedulesController } from './schedules/training-schedules.controller';
import { TrainingSchedulesService } from './schedules/training-schedules.service';
import { TrainingSessionsController } from './sessions/training-sessions.controller';
import { TrainingSessionsService } from './sessions/training-sessions.service';
import { TrainingsSchedulerService } from './trainings-scheduler.service';
import { PlayerEntity } from '../players/schemas/player.entity';
import { PlayerSchema } from '../players/schemas/player.schema';
import { User } from '../users/schemas/user.schema';
import { UserSchema } from '../users/schemas/user.schema';
import { MatchEntity } from '../matches/schemas/match.entity';
import { MatchSchema } from '../matches/schemas/match.schema';

@Module({
  imports: [
    GridFsModule,
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('AUTH_JWT_SECRET') ||
          configService.get<string>('GOOGLE_AUTH_JWT_SECRET') ||
          'super-secret-key',
        signOptions: { expiresIn: '1h' },
      }),
    }),
    MongooseModule.forFeature([
      {
        name: TrainingScheduleEntity.name,
        schema: TrainingScheduleSchema,
        collection: 'training_schedules',
      },
      {
        name: TrainingSessionEntity.name,
        schema: TrainingSessionSchema,
        collection: 'training_sessions',
      },
      {
        name: PlayerEntity.name,
        schema: PlayerSchema,
        collection: 'players',
      },
      {
        name: User.name,
        schema: UserSchema,
        collection: 'users',
      },
      {
        name: MatchEntity.name,
        schema: MatchSchema,
        collection: 'matches',
      },
    ]),
  ],
  controllers: [TrainingSchedulesController, TrainingSessionsController],
  providers: [TrainingSchedulesService, TrainingSessionsService, TrainingsSchedulerService],
  exports: [TrainingSchedulesService, TrainingSessionsService],
})
export class TrainingsModule {}
