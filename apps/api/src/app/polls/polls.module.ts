import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PollsController } from './polls.controller';
import { PollsPublicController } from './polls-public.controller';
import { PollsService } from './polls.service';
import { MatchPollEntity } from './schemas/match-poll.entity';
import { MatchPollSchema } from './schemas/match-poll.schema';
import { MatchEntity } from '../matches/schemas/match.entity';
import { MatchSchema } from '../matches/schemas/match.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MatchPollEntity.name, schema: MatchPollSchema },
      { name: MatchEntity.name, schema: MatchSchema },
    ]),
  ],
  controllers: [PollsController, PollsPublicController],
  providers: [PollsService],
})
export class PollsModule {}
