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
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripFilterDto } from './dto/trip-filter.dto';
import { AddParticipantDto } from './dto/add-participant.dto';
import { BulkAddParticipantsDto } from './dto/bulk-add-participants.dto';
import { BulkUpdateStatusDto } from './dto/bulk-update-status.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { AddTransportDto } from './dto/add-transport.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';
import { MoveParticipantDto } from './dto/move-participant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationDto } from '../shared/pagination.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleEnum } from '@ltrc-campo/shared-api-model';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('trips')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  findAll(@Query() query: PaginationDto<TripFilterDto>, @Req() req: Request) {
    return this.tripsService.findPaginated(query, (req as any).user);
  }

  @Post()
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  create(@Body() dto: CreateTripDto, @Req() req: Request) {
    return this.tripsService.create(dto, (req as any).user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tripsService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTripDto,
    @Req() req: Request
  ) {
    return this.tripsService.update(id, dto, (req as any).user);
  }

  @Delete(':id')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  delete(@Param('id') id: string) {
    return this.tripsService.delete(id);
  }

  // ── Participantes ──────────────────────────────────────────────────────────

  @Patch(':id/participants/bulk-status')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  bulkUpdateStatus(
    @Param('id') id: string,
    @Body() dto: BulkUpdateStatusDto,
    @Req() req: Request
  ) {
    return this.tripsService.bulkUpdateStatus(id, dto.participantIds, dto.status, (req as any).user);
  }

  @Post(':id/participants/bulk')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  bulkAddParticipants(
    @Param('id') id: string,
    @Body() dto: BulkAddParticipantsDto,
    @Req() req: Request
  ) {
    return this.tripsService.bulkAddParticipants(id, dto.participants, (req as any).user);
  }

  @Post(':id/participants')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  addParticipant(
    @Param('id') id: string,
    @Body() dto: AddParticipantDto,
    @Req() req: Request
  ) {
    return this.tripsService.addParticipant(id, dto, (req as any).user);
  }

  @Patch(':id/participants/:participantId')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  updateParticipant(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body() dto: UpdateParticipantDto,
    @Req() req: Request
  ) {
    return this.tripsService.updateParticipant(
      id,
      participantId,
      dto,
      (req as any).user
    );
  }

  @Delete(':id/participants')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  removeAllParticipants(@Param('id') id: string, @Req() req: Request) {
    return this.tripsService.removeAllParticipants(id, (req as any).user);
  }

  @Delete(':id/participants/:participantId')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  removeParticipant(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Req() req: Request
  ) {
    return this.tripsService.removeParticipant(
      id,
      participantId,
      (req as any).user
    );
  }

  // ── Pagos ──────────────────────────────────────────────────────────────────

  @Post(':id/participants/:participantId/payments')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  recordPayment(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body() dto: RecordPaymentDto,
    @Req() req: Request
  ) {
    return this.tripsService.recordPayment(
      id,
      participantId,
      dto,
      (req as any).user
    );
  }

  @Delete(':id/participants/:participantId/payments/:paymentId')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  removePayment(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Param('paymentId') paymentId: string,
    @Req() req: Request
  ) {
    return this.tripsService.removePayment(
      id,
      participantId,
      paymentId,
      (req as any).user
    );
  }

  // ── Transportes ───────────────────────────────────────────────────────────

  @Post(':id/transports')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  addTransport(
    @Param('id') id: string,
    @Body() dto: AddTransportDto,
    @Req() req: Request
  ) {
    return this.tripsService.addTransport(id, dto, (req as any).user);
  }

  @Patch(':id/transports/:transportId')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  updateTransport(
    @Param('id') id: string,
    @Param('transportId') transportId: string,
    @Body() dto: UpdateTransportDto,
    @Req() req: Request
  ) {
    return this.tripsService.updateTransport(
      id,
      transportId,
      dto,
      (req as any).user
    );
  }

  @Delete(':id/transports/:transportId')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  removeTransport(
    @Param('id') id: string,
    @Param('transportId') transportId: string,
    @Req() req: Request
  ) {
    return this.tripsService.removeTransport(
      id,
      transportId,
      (req as any).user
    );
  }

  @Post(':id/transports/draft')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER)
  draftTransportAssignment(@Param('id') id: string, @Req() req: Request) {
    return this.tripsService.draftTransportAssignment(id, (req as any).user);
  }

  @Patch(':id/participants/:participantId/transport')
  @Roles(RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH)
  moveParticipant(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body() dto: MoveParticipantDto,
    @Req() req: Request
  ) {
    return this.tripsService.moveParticipant(
      id,
      participantId,
      dto,
      (req as any).user
    );
  }
}
