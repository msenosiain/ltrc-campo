import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Body,
  Param,
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
import { TrainingSessionsService } from './training-sessions.service';
import { PaginationDto } from '../../shared/pagination.dto';
import { TrainingSessionFiltersDto } from './training-session-filter.dto';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { CheckinDto } from './dto/checkin.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

@Controller('training-sessions')
export class TrainingSessionsController {
  constructor(private readonly sessionsService: TrainingSessionsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findPaginated(
    @Query() pagination: PaginationDto<TrainingSessionFiltersDto>,
    @Req() req: Request
  ) {
    return this.sessionsService.findPaginated(pagination, (req as any).user);
  }

  @Get('upcoming')
  @UseGuards(JwtAuthGuard)
  async getUpcoming(@Query('days') days?: string, @Query('today') today?: string, @Req() req?: Request) {
    return this.sessionsService.getUpcomingForUser(
      (req as any).user,
      days ? parseInt(days, 10) : 7,
      today,
    );
  }

  @Post()
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COORDINATOR, RoleEnum.COACH, RoleEnum.TRAINER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async create(@Body() dto: CreateTrainingSessionDto, @Req() req: Request) {
    return this.sessionsService.create(dto, (req as any).user);
  }

  @Get('stats/attendance')
  @UseGuards(JwtAuthGuard)
  async getAttendanceStats(
    @Req() req: Request,
    @Query('sport') sport?: string,
    @Query('category') category?: string,
  ) {
    return this.sessionsService.getAttendanceStats((req as any).user, { sport, category });
  }

  @Get('stats/trend')
  @UseGuards(JwtAuthGuard)
  async getAttendanceTrend(
    @Req() req: Request,
    @Query('sport') sport?: string,
    @Query('category') category?: string,
    @Query('period') period?: string,
    @Query('categoryGroup') categoryGroup?: 'competitive' | 'non-competitive',
  ) {
    return this.sessionsService.getAttendanceTrend((req as any).user, { sport, category, period, categoryGroup });
  }

  @Get('stats/participation-overlap')
  @UseGuards(JwtAuthGuard)
  async getParticipationOverlap(
    @Req() req: Request,
    @Query('sport') sport?: string,
    @Query('period') period?: string,
  ) {
    return this.sessionsService.getParticipationOverlap((req as any).user, { sport, period });
  }

  @Get('stats/non-competitive-by-category')
  @UseGuards(JwtAuthGuard)
  async getNonCompetitiveByCategory(
    @Req() req: Request,
    @Query('sport') sport?: string,
    @Query('period') period?: string,
  ) {
    return this.sessionsService.getNonCompetitiveByCategory((req as any).user, { sport, period });
  }

  @Get('stats/attendance-report')
  @UseGuards(JwtAuthGuard)
  async getAttendanceReport(
    @Req() req: Request,
    @Query('sport') sport?: string,
    @Query('category') category?: string,
    @Query('playerId') playerId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('type') type?: 'training' | 'match' | 'both',
  ) {
    return this.sessionsService.getAttendanceReport((req as any).user, {
      sport,
      category,
      playerId,
      fromDate,
      toDate,
      type,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COORDINATOR, RoleEnum.COACH, RoleEnum.TRAINER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateTrainingSessionDto, @Req() req: Request) {
    return this.sessionsService.update(id, dto, (req as any).user);
  }

  @Delete(':id')
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async delete(@Param('id') id: string) {
    return this.sessionsService.delete(id);
  }

  @Post(':id/confirm')
  @UseGuards(JwtAuthGuard)
  async confirmAttendance(
    @Param('id') id: string,
    @Req() req: Request
  ) {
    return this.sessionsService.confirmAttendance(id, (req as any).user);
  }

  @Delete(':id/confirm')
  @UseGuards(JwtAuthGuard)
  async cancelConfirmation(@Param('id') id: string, @Req() req: Request) {
    return this.sessionsService.cancelConfirmation(id, (req as any).user);
  }

  @Get(':id/staff-options')
  @UseGuards(JwtAuthGuard)
  async getStaffForSession(@Param('id') id: string) {
    return this.sessionsService.getStaffForSession(id);
  }

  @Get(':id/checkin-token')
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COORDINATOR, RoleEnum.COACH, RoleEnum.TRAINER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getCheckinToken(@Param('id') id: string) {
    return this.sessionsService.generateCheckinToken(id);
  }

  @Post(':id/checkin')
  @UseGuards(JwtAuthGuard)
  async checkin(
    @Param('id') id: string,
    @Body() dto: CheckinDto,
    @Req() req: Request
  ) {
    await this.sessionsService.checkin(id, dto.token, (req as any).user);
    return { message: 'Asistencia confirmada' };
  }

  @Post(':id/attachments')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH, RoleEnum.ANALYST, RoleEnum.TRAINER)
  @UseGuards(JwtAuthGuard, RolesGuard)
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
    return this.sessionsService.addAttachment(id, file, name, visibility as any, players);
  }

  @Get(':id/attachments/:fileId')
  @UseGuards(JwtAuthGuard)
  async getAttachment(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res() res: Response
  ) {
    const { stream, mimeType, filename } = await this.sessionsService.getAttachmentStream(id, fileId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    stream.pipe(res);
  }

  @Patch(':id/attachments/:fileId')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH, RoleEnum.ANALYST, RoleEnum.TRAINER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async updateAttachment(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Body('name') name: string,
    @Body('visibility') visibility: string,
    @Body('targetPlayers') targetPlayers?: string[]
  ) {
    return this.sessionsService.updateAttachment(id, fileId, name, visibility as any, targetPlayers);
  }

  @Delete(':id/attachments/:fileId')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH, RoleEnum.ANALYST)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async deleteAttachment(@Param('id') id: string, @Param('fileId') fileId: string) {
    return this.sessionsService.deleteAttachment(id, fileId);
  }

  @Patch(':id/attendance')
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COORDINATOR, RoleEnum.COACH, RoleEnum.TRAINER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async recordAttendance(
    @Param('id') id: string,
    @Body() dto: RecordAttendanceDto,
    @Req() req: Request
  ) {
    return this.sessionsService.recordAttendance(id, dto, (req as any).user.id);
  }
}
