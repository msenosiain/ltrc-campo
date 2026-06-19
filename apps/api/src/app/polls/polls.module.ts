import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PollsController } from './polls.controller';
import { PollsPublicController } from './polls-public.controller';
import { PollsService } from './polls.service';
import { MatchPollEntity } from './schemas/match-poll.entity';
import { MatchPollSchema } from './schemas/match-poll.schema';
import { MatchEntity } from '../matches/schemas/match.entity';
import { MatchSchema } from '../matches/schemas/match.schema';
import { InternalPollEntity } from './schemas/internal-poll.entity';
import { InternalPollSchema } from './schemas/internal-poll.schema';
import { InternalPollsService } from './internal-polls.service';
import { InternalPollsController } from './internal-polls.controller';
import { User } from '../users/schemas/user.schema';
import { UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MatchPollEntity.name, schema: MatchPollSchema },
      { name: MatchEntity.name, schema: MatchSchema },
      { name: InternalPollEntity.name, schema: InternalPollSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PollsController, PollsPublicController, InternalPollsController],
  providers: [PollsService, InternalPollsService],
})
export class PollsModule {}
