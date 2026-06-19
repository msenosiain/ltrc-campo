import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PollsService } from './polls.service';
import { CreatePollDto } from './dto/create-poll.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

@Controller('matches/:matchId/poll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}

  @Post()
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  create(@Param('matchId') matchId: string, @Body() dto: CreatePollDto, @Req() req: Request) {
    return this.pollsService.createPoll(matchId, dto, (req as any).user?._id?.toString());
  }

  @Get()
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  getForMatch(@Param('matchId') matchId: string) {
    return this.pollsService.getPollForMatch(matchId);
  }

  @Patch()
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  update(@Param('matchId') matchId: string, @Body() dto: Partial<CreatePollDto>) {
    return this.pollsService.updatePoll(matchId, dto);
  }

  @Delete()
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  delete(@Param('matchId') matchId: string) {
    return this.pollsService.deletePoll(matchId);
  }
}
