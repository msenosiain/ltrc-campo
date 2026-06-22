import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GridFsModule } from '../shared/gridfs/gridfs.module';
import { CmjRecordEntity } from './schemas/cmj-record.entity';
import { CmjRecordSchema } from './schemas/cmj-record.schema';
import { CmrjRecordEntity } from './schemas/cmrj-record.entity';
import { CmrjRecordSchema } from './schemas/cmrj-record.schema';
import { TrainingSessionEntity } from '../trainings/sessions/schemas/training-session.entity';
import { TrainingSessionSchema } from '../trainings/sessions/schemas/training-session.schema';
import { PlayerEntity } from '../players/schemas/player.entity';
import { PlayerSchema } from '../players/schemas/player.schema';
import { ForcedeckController } from './forcedeck.controller';
import { ForcedeckService } from './forcedeck.service';
import { ForcedeckAggregationService } from './forcedeck-aggregation.service';
import { ForcedeckPdfService } from './forcedeck-pdf.service';

@Module({
  imports: [
    GridFsModule,
    MongooseModule.forFeature([
      { name: CmjRecordEntity.name, schema: CmjRecordSchema, collection: 'cmj_records' },
      { name: CmrjRecordEntity.name, schema: CmrjRecordSchema, collection: 'cmrj_records' },
      {
        name: TrainingSessionEntity.name,
        schema: TrainingSessionSchema,
        collection: 'training_sessions',
      },
      { name: PlayerEntity.name, schema: PlayerSchema, collection: 'players' },
    ]),
  ],
  controllers: [ForcedeckController],
  providers: [ForcedeckService, ForcedeckAggregationService, ForcedeckPdfService],
})
export class ForcedeckModule {}
