import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { InternalPollsService } from './internal-polls.service';
import { CreateInternalPollDto } from './dto/create-internal-poll.dto';
import { CastInternalVotesDto } from './dto/cast-internal-votes.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

const ADMIN_ROLES = [RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH];

@Controller('matches/:matchId/internal-poll')
@UseGuards(JwtAuthGuard)
export class InternalPollsController {
  constructor(private readonly service: InternalPollsService) {}

  // ── Admin endpoints ──────────────────────────────────────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  create(@Param('matchId') matchId: string, @Body() dto: CreateInternalPollDto, @Req() req: Request) {
    const user = (req as any).user;
    return this.service.createPoll(matchId, dto, user._id.toString());
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  get(@Param('matchId') matchId: string) {
    return this.service.getPoll(matchId);
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  update(@Param('matchId') matchId: string, @Body() dto: Partial<CreateInternalPollDto>) {
    return this.service.updatePoll(matchId, dto);
  }

  @Delete()
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  delete(@Param('matchId') matchId: string) {
    return this.service.deletePoll(matchId);
  }

  @Get('results')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  getResults(@Param('matchId') matchId: string, @Req() req: Request) {
    const user = (req as any).user;
    return this.service.getResults(matchId, user._id.toString(), user.roles ?? []);
  }

  @Get('staff-search')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  searchStaff(@Query('q') q: string) {
    return this.service.searchStaff(q ?? '');
  }

  // ── Voter endpoints (any authenticated user) ─────────────────────────────────

  @Get('info')
  getInfo(@Param('matchId') matchId: string, @Req() req: Request) {
    const user = (req as any).user;
    return this.service.getInfo(matchId, user._id.toString());
  }

  @Post('vote')
  castVotes(@Param('matchId') matchId: string, @Body() dto: CastInternalVotesDto, @Req() req: Request) {
    const user = (req as any).user;
    return this.service.castVotes(matchId, dto, user._id.toString());
  }

  @Get('voter-results')
  voterResults(@Param('matchId') matchId: string, @Req() req: Request) {
    const user = (req as any).user;
    return this.service.getResults(matchId, user._id.toString(), user.roles ?? []);
  }
}
