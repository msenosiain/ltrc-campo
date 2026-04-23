import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
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

import { PlayersService } from './players.service';
import { PaginationDto } from '../shared/pagination.dto';
import { PlayerFiltersDto } from './player-filter.dto';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleEnum } from '@ltrc-campo/shared-api-model';
import { User } from '../users/schemas/user.schema';

@Controller('players')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get()
  async findPaginated(
    @Query() pagination: PaginationDto<PlayerFiltersDto>,
    @Req() req: Request
  ) {
    return this.playersService.findPaginated(pagination, (req as any).user);
  }

  @Post('filter')
  async findPaginatedPost(
    @Body() body: { pagination: PaginationDto<PlayerFiltersDto> },
    @Req() req: Request
  ) {
    return this.playersService.findPaginated(body.pagination, (req as any).user);
  }

  @Post('import')
  @Roles(RoleEnum.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async importFromFile(@UploadedFile() file: MulterFile) {
    return this.playersService.importFromFile(file.buffer);
  }

  @Post('update-from-survey')
  @Roles(RoleEnum.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async updateFromSurvey(@UploadedFile() file: MulterFile) {
    return this.playersService.updateFromSurvey(file.buffer);
  }

  // ⚠️ Debe estar ANTES de GET :id para que rutas con prefijo no sean interpretadas como un ID
  @Get('by-user/:userId')
  async findByUserId(@Param('userId') userId: string) {
    return this.playersService.findByUserId(userId);
  }

  @Get('me')
  async getMyPlayer(@Req() req: Request) {
    const user = (req as any).user as User;
    const userId = (user as any)._id?.toString();
    const player = await this.playersService.findByUserId(userId);
    if (!player) throw new NotFoundException('No player linked to this user');
    return player;
  }

  @Patch('me')
  @Roles(RoleEnum.ADMIN, RoleEnum.PLAYER)
  async updateMyProfile(@Body() dto: UpdateMyProfileDto, @Req() req: Request) {
    const user = (req as any).user as User;
    const userId = (user as any)._id?.toString();
    return this.playersService.updateSelf(userId, dto);
  }

  @Post()
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  @UseInterceptors(FileInterceptor('photo'))
  async create(
    @Body() dto: CreatePlayerDto,
    @UploadedFile() photo?: MulterFile,
    @Req() req?: Request
  ) {
    return this.playersService.create(dto, photo, (req as any)?.user);
  }

  @Patch(':id')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  @UseInterceptors(FileInterceptor('photo'))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePlayerDto,
    @UploadedFile() photo?: MulterFile,
    @Req() req?: Request
  ) {
    return this.playersService.update(id, dto, photo, (req as any)?.user);
  }

  @Get('stats')
  async getStats(@Req() req: Request) {
    return this.playersService.getStats((req as any).user);
  }

  @Get('stats/growth')
  async getGrowthStats(@Req() req: Request, @Query('period') period?: string) {
    return this.playersService.getGrowthStats((req as any).user, period);
  }

  @Get('stats/age-distribution')
  async getAgeDistribution(@Req() req: Request) {
    return this.playersService.getAgeDistribution((req as any).user);
  }

  @Get('field-options')
  async getFieldOptions() {
    return this.playersService.getFieldOptions();
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.playersService.findOne(id);
  }

  @Get(':id/photo')
  async getPhoto(@Param('id') id: string, @Res() res: Response) {
    const player = await this.playersService.findOne(id);
    if (!player.photoId) throw new NotFoundException('Player has no photo');

    const stream = await this.playersService.getPhotoStream(player.photoId);
    res.setHeader('Content-Type', 'image/jpeg');
    stream.pipe(res);
  }

  @Delete(':id/photo')
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COACH)
  async deletePhoto(@Param('id') id: string) {
    return this.playersService.deletePhoto(id);
  }

  @Patch(':id/availability')
  @Roles(
    RoleEnum.ADMIN,
    RoleEnum.MANAGER,
    RoleEnum.COACH,
    RoleEnum.KINE,
    RoleEnum.TRAINER
  )
  async updateAvailability(@Param('id') id: string, @Body() dto: any) {
    return this.playersService.updateAvailability(id, dto);
  }

  @Delete(':id')
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER)
  async delete(@Param('id') id: string) {
    return this.playersService.delete(id);
  }
}
