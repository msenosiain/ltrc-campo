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
import { CategoryEnum, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { Request } from 'express';
import { SquadsService } from './squads.service';
import { CreateSquadDto } from './dto/create-squad.dto';
import { UpdateSquadDto } from './dto/update-squad.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('squads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SquadsController {
  constructor(private readonly squadsService: SquadsService) {}

  @Get()
  async findAll(
    @Query('sport') sport?: SportEnum,
    @Query('category') category?: CategoryEnum,
    @Req() req?: Request
  ) {
    return this.squadsService.findAll(sport, category, (req as any)?.user);
  }

  @Post()
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COACH)
  async create(@Body() dto: CreateSquadDto, @Req() req?: Request) {
    return this.squadsService.create(dto, (req as any)?.user);
  }

  @Get(':id')
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COACH)
  async getOne(@Param('id') id: string) {
    return this.squadsService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COACH)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSquadDto,
    @Req() req?: Request
  ) {
    return this.squadsService.update(id, dto, (req as any)?.user);
  }

  @Delete(':id')
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COACH)
  async delete(@Param('id') id: string) {
    return this.squadsService.delete(id);
  }
}
