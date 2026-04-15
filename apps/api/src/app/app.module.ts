import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Joi from 'joi';
import { PlayersModule } from './players/players.module';
import { MatchesModule } from './matches/matches.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { SquadsModule } from './squads/squads.module';
import { BranchAssignmentsModule } from './branch-assignments/branch-assignments.module';
import { MongooseModule } from '@nestjs/mongoose';
import { GridFsModule } from './shared/gridfs/gridfs.module';
import { AuthModule } from './auth/auth.module';
import { join } from 'path';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { TrainingsModule } from './trainings/trainings.module';
import { TripsModule } from './trips/trips.module';
import { ExercisesModule } from './exercises/exercises.module';
import { WorkoutsModule } from './workouts/workouts.module';
import { WorkoutLogsModule } from './workout-logs/workout-logs.module';
import { CalendarModule } from './calendar/calendar.module';
import { PaymentsModule } from './payments/payments.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { PlayerFeesModule } from './player-fees/player-fees.module';

export const configSchema = Joi.object({
  API_PORT: Joi.number().integer().default(3000),
  API_GLOBAL_PREFIX: Joi.string().default('/api/v1'),
  API_CORS_ALLOWED_ORIGINS: Joi.string().allow('').optional(),
  MONGODB_URI: Joi.string().required(),
  GOOGLE_AUTH_CLIENT_ID: Joi.string().allow('').optional(),
  GOOGLE_AUTH_CLIENT_SECRET: Joi.string().allow('').optional(),
  GOOGLE_AUTH_REDIRECT_URL: Joi.string().allow('').optional(),
  GOOGLE_AUTH_ALLOWED_DOMAIN: Joi.string().allow('').optional(),
  GOOGLE_AUTH_CALLBACK_URL: Joi.string().allow('').optional(),
  GOOGLE_AUTH_JWT_SECRET: Joi.string().allow('').optional(),
  GOOGLE_AUTH_REFRESH_JWT_SECRET: Joi.string().allow('').optional(),
  AUTH_JWT_SECRET: Joi.string().optional(),
  AUTH_REFRESH_JWT_SECRET: Joi.string().optional(),
  MP_ACCESS_TOKEN: Joi.string().allow('').optional(),
  MP_FEE_RATE: Joi.number().default(4.83),
  APP_BASE_URL: Joi.string().default('http://localhost:4200'),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '.env', // Archivo unificado en la raíz
        join(__dirname, '..', '..', '.env'), // Fallback para estructura de build
        join(process.cwd(), 'apps', 'api', '.env'), // Legacy path
      ],
      validationSchema: configSchema,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>(
          'MONGODB_URI',
          'mongodb://localhost:27017/ltrc-campo'
        ),
      }),
    }),
    GridFsModule,
    AuthModule,
    UsersModule,
    PlayersModule,
    MatchesModule,
    TournamentsModule,
    SquadsModule,
    BranchAssignmentsModule,
    TrainingsModule,
    TripsModule,
    ExercisesModule,
    WorkoutsModule,
    WorkoutLogsModule,
    CalendarModule,
    PaymentsModule,
    EvaluationsModule,
    PlayerFeesModule,
    HealthModule,
  ],
})
export class AppModule {}
