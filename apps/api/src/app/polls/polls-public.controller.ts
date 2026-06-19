import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { PollsService } from './polls.service';
import { CastVoteDto } from './dto/cast-vote.dto';

@Controller('polls/public')
export class PollsPublicController {
  constructor(private readonly pollsService: PollsService) {}

  @Get(':slug')
  getPublicInfo(@Param('slug') slug: string) {
    return this.pollsService.getPublicInfo(slug);
  }

  @Post(':slug/vote')
  castVote(@Param('slug') slug: string, @Body() dto: CastVoteDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
    const ua = req.headers['user-agent'] ?? 'unknown';
    return this.pollsService.castVote(slug, dto, ip, ua);
  }

  @Get(':slug/results')
  getResults(@Param('slug') slug: string) {
    return this.pollsService.getResults(slug);
  }
}
