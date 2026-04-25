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
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import type { File as MulterFile } from 'multer';

import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { TournamentFilterDto } from './dto/tournament-filter.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationDto } from '../shared/pagination.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

@Controller('tournaments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get()
  async findAll(
    @Query() query: PaginationDto<TournamentFilterDto>,
    @Req() req: Request
  ) {
    return this.tournamentsService.findPaginated(query, (req as any).user);
  }

  @Post()
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  async create(@Body() dto: CreateTournamentDto, @Req() req: Request) {
    return this.tournamentsService.create(dto, (req as any).user);
  }

  // --- Logo ---

  @Post(':id/logo')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(@Param('id') id: string, @UploadedFile() file: MulterFile) {
    return this.tournamentsService.uploadLogo(id, file);
  }

  @Get(':id/logo')
  async getLogo(@Param('id') id: string, @Res() res: Response) {
    const { stream, mimetype } = await this.tournamentsService.getLogoStream(id);
    res.setHeader('Content-Type', mimetype);
    stream.pipe(res);
  }

  @Delete(':id/logo')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  async deleteLogo(@Param('id') id: string) {
    return this.tournamentsService.removeLogo(id);
  }

  // --- Attachments (before :id to avoid route conflicts) ---

  @Post(':id/attachments')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: MulterFile
  ) {
    return this.tournamentsService.addAttachment(id, file);
  }

  @Get(':id/attachments/:attachmentId')
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response
  ) {
    const { stream, filename, mimetype } =
      await this.tournamentsService.getAttachmentStream(id, attachmentId);
    res.setHeader('Content-Type', mimetype);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(filename)}"`
    );
    stream.pipe(res);
  }

  @Delete(':id/attachments/:attachmentId')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  async deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string
  ) {
    return this.tournamentsService.removeAttachment(id, attachmentId);
  }

  @Patch(':id')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTournamentDto,
    @Req() req: Request
  ) {
    return this.tournamentsService.update(id, dto, (req as any).user);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.tournamentsService.findOne(id);
  }

  @Delete(':id')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  async delete(@Param('id') id: string) {
    return this.tournamentsService.delete(id);
  }
}
