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
import { PlayerFeesService } from './player-fees.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CategoryEnum, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { CreatePlayerFeeConfigDto } from './dto/create-player-fee-config.dto';
import { UpdatePlayerFeeConfigDto } from './dto/update-player-fee-config.dto';
import { CreateFamilyGroupDto } from './dto/create-family-group.dto';
import { UpdateSeasonRecordDto } from './dto/update-season-record.dto';
import { BduarImportDto } from './dto/bduar-import.dto';
import { RecordManualFeePaymentDto } from './dto/record-manual-fee-payment.dto';
import { ImportFamilyGroupsDto } from './dto/import-family-groups.dto';

@Controller('player-fees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlayerFeesController {
  constructor(private readonly service: PlayerFeesService) {}

  // ── Config (Admin) ────────────────────────────────────────────────────────

  @Get('config')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  listConfigs() {
    return this.service.listConfigs();
  }

  @Post('config')
  @Roles(RoleEnum.ADMIN)
  createConfig(@Body() dto: CreatePlayerFeeConfigDto, @Req() req: Request) {
    return this.service.createConfig(dto, (req as any).user.userId);
  }

  @Patch('config/:id')
  @Roles(RoleEnum.ADMIN)
  updateConfig(@Param('id') id: string, @Body() dto: UpdatePlayerFeeConfigDto) {
    return this.service.updateConfig(id, dto);
  }

  @Post('config/:id/activate')
  @Roles(RoleEnum.ADMIN)
  activateConfig(@Param('id') id: string) {
    return this.service.activateConfig(id);
  }

  @Post('config/:id/deactivate')
  @Roles(RoleEnum.ADMIN)
  deactivateConfig(@Param('id') id: string) {
    return this.service.deactivateConfig(id);
  }

  @Delete('config/:id')
  @Roles(RoleEnum.ADMIN)
  deleteConfig(@Param('id') id: string) {
    return this.service.deleteConfig(id);
  }

  // ── Family groups (Admin) ─────────────────────────────────────────────────

  @Get('families')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR)
  listFamilyGroups() {
    return this.service.listFamilyGroups();
  }

  @Post('families')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR)
  createFamilyGroup(@Body() dto: CreateFamilyGroupDto, @Req() req: Request) {
    return this.service.createFamilyGroup(dto, (req as any).user.userId);
  }

  @Patch('families/:id')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR)
  updateFamilyGroup(@Param('id') id: string, @Body() dto: CreateFamilyGroupDto) {
    return this.service.updateFamilyGroup(id, dto);
  }

  @Delete('families/:id')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR)
  deleteFamilyGroup(@Param('id') id: string) {
    return this.service.deleteFamilyGroup(id);
  }

  // ── Season records (Admin / Coordinator / Coach) ─────────────────────────

  @Patch('season-record/:playerId')
  @Roles(RoleEnum.ADMIN)
  updateSeasonRecord(
    @Param('playerId') playerId: string,
    @Body() dto: UpdateSeasonRecordDto,
    @Req() req: Request,
  ) {
    return this.service.updateSeasonRecord(playerId, dto, (req as any).user.userId);
  }

  // ── Family groups import ──────────────────────────────────────────────────

  @Post('import/family-groups')
  @Roles(RoleEnum.ADMIN)
  importFamilyGroups(@Body() dto: ImportFamilyGroupsDto, @Req() req: Request) {
    return this.service.importFamilyGroups(dto.groups, (req as any).user.userId);
  }

  // ── BDUAR import ─────────────────────────────────────────────────────────

  @Post('import/bduar')
  @Roles(RoleEnum.ADMIN)
  importBduar(@Body() dto: BduarImportDto, @Req() req: Request) {
    return this.service.importFromBduar(dto, (req as any).user.userId);
  }

  // ── Manual payment ───────────────────────────────────────────────────────

  @Get('manual-payment/preview')
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER)
  previewManualPayment(
    @Query('playerId') playerId: string,
    @Query('season') season: string,
    @Query('sport') sport: SportEnum,
  ) {
    return this.service.previewManualPayment(playerId, season, sport);
  }

  @Post('manual-payment')
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER)
  recordManualPayment(@Body() dto: RecordManualFeePaymentDto) {
    return this.service.recordManualPayment(dto);
  }

  // ── Status + Stats ────────────────────────────────────────────────────────

  @Get('player-status/:playerId')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  getPlayerStatus(
    @Param('playerId') playerId: string,
    @Query('season') season: string,
  ) {
    return this.service.getPlayerStatus(playerId, season);
  }

  @Get('status')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  getStatus(
    @Query('season') season: string,
    @Query('sport') sport: SportEnum,
    @Query('category') category?: string,
    @Query('categories') categories?: string | string[],
  ) {
    const cats = categories
      ? (Array.isArray(categories) ? categories : [categories]) as CategoryEnum[]
      : undefined;
    return this.service.getStatus(season, sport, cats?.length ? undefined : category, cats);
  }

  @Post('migrate-payment-records')
  @Roles(RoleEnum.ADMIN)
  migratePaymentRecords() {
    return this.service.migratePaymentRecords();
  }

  @Get('stats')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  getStats(
    @Query('season') season: string,
    @Query('sport') sport: SportEnum,
  ) {
    return this.service.getStats(season, sport);
  }
}
