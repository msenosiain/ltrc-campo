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
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleEnum } from '@ltrc-campo/shared-api-model';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './schemas/user.schema';
import { PaginationDto } from '../shared/pagination.dto';
import { UserFiltersDto } from './dto/user-filter.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() payload: CreateUserDto): Promise<User> {
    return await this.usersService.create(payload);
  }

  // Búsqueda de staff para pasajeros de viajes: managers/coordinadores/coaches
  // sólo ven usuarios dentro de sus sports/categories asignados (ver UsersService#findAll).
  @Get()
  @Roles(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COORDINATOR, RoleEnum.COACH)
  async findAll(
    @Query() query: PaginationDto<UserFiltersDto>,
    @Req() req: Request
  ) {
    return this.usersService.findAll(query, (req as any).user);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<User> {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto
  ): Promise<User> {
    const user = await this.usersService.update(id, dto);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<User> {
    const user = await this.usersService.delete(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string): Promise<{ message: string }> {
    const user = await this.usersService.resetPassword(id);
    if (!user) throw new NotFoundException('User not found');
    return { message: 'Password reset successfully' };
  }
}
