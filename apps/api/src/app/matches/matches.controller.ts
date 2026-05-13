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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { File as MulterFile } from 'multer';
import { Request, Response } from 'express';

import { MatchesService } from './matches.service';
import { PaginationDto } from '../shared/pagination.dto';
import { MatchFiltersDto } from './match-filter.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import { CreateMatchBulkDto } from './dto/create-match-bulk.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { UpdateMatchSquadDto } from './dto/update-players.dto';
import { RecordMatchAttendanceDto } from './dto/record-match-attendance.dto';
import { ManageVideoDto } from './dto/manage-video.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

@Controller('matches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  async findPaginated(
    @Query() pagination: PaginationDto<MatchFiltersDto>,
    @Req() req: Request
  ) {
    return this.matchesService.findPaginated(pagination, (req as any).user);
  }

  @Post()
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  async create(@Body() dto: CreateMatchDto, @Req() req: Request) {
    return this.matchesService.create(dto, (req as any).user);
  }

  @Post('bulk')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  async createBulk(@Body() dto: CreateMatchBulkDto, @Req() req: Request) {
    return this.matchesService.createBulk(dto, (req as any).user);
  }

  @Patch(':id')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMatchDto,
    @Req() req: Request
  ) {
    return this.matchesService.update(id, dto, (req as any).user);
  }

  @Patch(':id/squad')
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COACH)
  async updateSquad(@Param('id') id: string, @Body() dto: UpdateMatchSquadDto) {
    return this.matchesService.updateSquad(id, dto.squad);
  }

  @Patch(':id/attendance')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH, RoleEnum.TRAINER)
  async recordAttendance(
    @Param('id') id: string,
    @Body() dto: RecordMatchAttendanceDto,
    @Req() req: Request
  ) {
    return this.matchesService.recordAttendance(id, dto, (req as any).user.id);
  }

  @Post(':id/squad/from/:squadId')
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COACH)
  async applySquadTemplate(
    @Param('id') id: string,
    @Param('squadId') squadId: string
  ) {
    return this.matchesService.applySquadTemplate(id, squadId);
  }

  @Get('my-squad')
  async getMySquadMatches(
    @Query() pagination: PaginationDto<MatchFiltersDto>,
    @Req() req: Request
  ) {
    const user = (req as any).user;
    const player = await this.matchesService.findPlayerByUserId(
      (user as any)._id?.toString()
    );
    if (!player)
      return {
        items: [],
        total: 0,
        page: pagination.page ?? 1,
        size: pagination.size ?? 10,
      };
    const filters = {
      ...(pagination.filters ?? {}),
      playerId: (player as any)._id?.toString(),
    };
    return this.matchesService.findPaginated(
      { ...pagination, filters },
      (req as any).user
    );
  }

  @Get('field-options')
  async getFieldOptions(
    @Req() req: Request,
    @Query('category') category?: string
  ) {
    return this.matchesService.getFieldOptions(
      (req as any).user,
      category as any
    );
  }

  @Post(':id/attachments')
  @Roles(
    RoleEnum.ADMIN,
    RoleEnum.COORDINATOR,
    RoleEnum.MANAGER,
    RoleEnum.COACH,
    RoleEnum.ANALYST,
    RoleEnum.TRAINER
  )
  @UseInterceptors(FileInterceptor('file'))
  async addAttachment(
    @Param('id') id: string,
    @UploadedFile() file: MulterFile,
    @Body('name') name?: string,
    @Body('visibility') visibility?: string,
    @Body('targetPlayers') targetPlayers?: string | string[]
  ) {
    const players = targetPlayers
      ? Array.isArray(targetPlayers)
        ? targetPlayers
        : JSON.parse(targetPlayers)
      : undefined;
    return this.matchesService.addAttachment(
      id,
      file,
      name,
      visibility as any,
      players
    );
  }

  @Get(':id/attachments/:fileId')
  async getAttachment(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res() res: Response
  ) {
    const { stream, mimeType, filename } = await this.matchesService.getAttachmentStream(
      id,
      fileId
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    stream.pipe(res);
  }

  @Patch(':id/attachments/:fileId')
  @Roles(
    RoleEnum.ADMIN,
    RoleEnum.COORDINATOR,
    RoleEnum.MANAGER,
    RoleEnum.COACH,
    RoleEnum.ANALYST
  )
  async updateAttachment(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Body('name') name: string,
    @Body('visibility') visibility: string,
    @Body('targetPlayers') targetPlayers?: string[]
  ) {
    return this.matchesService.updateAttachment(
      id,
      fileId,
      name,
      visibility as any,
      targetPlayers
    );
  }

  @Delete(':id/attachments/:fileId')
  @Roles(
    RoleEnum.ADMIN,
    RoleEnum.COORDINATOR,
    RoleEnum.MANAGER,
    RoleEnum.COACH,
    RoleEnum.ANALYST
  )
  async deleteAttachment(
    @Param('id') id: string,
    @Param('fileId') fileId: string
  ) {
    return this.matchesService.deleteAttachment(id, fileId);
  }

  @Post(':id/videos')
  @Roles(
    RoleEnum.ADMIN,
    RoleEnum.COORDINATOR,
    RoleEnum.MANAGER,
    RoleEnum.COACH,
    RoleEnum.ANALYST
  )
  async addVideo(@Param('id') id: string, @Body() dto: ManageVideoDto) {
    return this.matchesService.addVideo(id, dto);
  }

  @Patch(':id/videos/:videoId')
  @Roles(
    RoleEnum.ADMIN,
    RoleEnum.COORDINATOR,
    RoleEnum.MANAGER,
    RoleEnum.COACH,
    RoleEnum.ANALYST
  )
  async updateVideo(
    @Param('id') id: string,
    @Param('videoId') videoId: string,
    @Body() dto: ManageVideoDto
  ) {
    return this.matchesService.updateVideo(id, videoId, dto);
  }

  @Delete(':id/videos/:videoId')
  @Roles(
    RoleEnum.ADMIN,
    RoleEnum.COORDINATOR,
    RoleEnum.MANAGER,
    RoleEnum.COACH,
    RoleEnum.ANALYST
  )
  async deleteVideo(
    @Param('id') id: string,
    @Param('videoId') videoId: string
  ) {
    return this.matchesService.deleteVideo(id, videoId);
  }

  @Get('stats/attendance')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  async getAttendanceStats(
    @Req() req: Request,
    @Query('sport') sport?: string,
    @Query('category') category?: string,
  ) {
    return this.matchesService.getAttendanceStats((req as any).user, sport, category);
  }

  @Get('stats/trend')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  async getAttendanceTrend(
    @Req() req: Request,
    @Query('sport') sport?: string,
    @Query('category') category?: string,
    @Query('period') period?: string,
    @Query('categoryGroup') categoryGroup?: 'competitive' | 'non-competitive',
  ) {
    return this.matchesService.getAttendanceTrend((req as any).user, { sport, category, period, categoryGroup });
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: Request) {
    return this.matchesService.findOne(id, (req as any).user);
  }

  @Delete(':id')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  async delete(@Param('id') id: string) {
    return this.matchesService.delete(id);
  }
}
