import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TripEntity, TripLodgingEntity, TripParticipantEntity, TripTransportEntity } from './schemas/trip.entity';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripFilterDto } from './dto/trip-filter.dto';
import { AddParticipantDto } from './dto/add-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { AddTransportDto } from './dto/add-transport.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';
import { MoveParticipantDto } from './dto/move-participant.dto';
import { AddLodgingDto } from './dto/add-lodging.dto';
import { UpdateLodgingDto } from './dto/update-lodging.dto';
import { MoveParticipantLodgingDto } from './dto/move-participant-lodging.dto';
import { PaginationDto } from '../shared/pagination.dto';
import {
  CategoryEnum,
  CATEGORY_AGE_RANK,
  MAX_CATEGORY_AGE_GAP,
  PaginatedResponse,
  PaymentEntityTypeEnum,
  PaymentStatusEnum,
  RoleEnum,
  SortOrder,
  TripParticipantTypeEnum,
  TripParticipantStatusEnum,
} from '@ltrc-campo/shared-api-model';
import { User } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { PlayersService } from '../players/players.service';
import { PaymentEntity } from '../payments/schemas/payment.entity';

const POPULATE_FIELDS = [
  { path: 'participants.player', select: 'name category sport idNumber' },
  { path: 'participants.user', select: 'name email idNumber categories sports' },
  { path: 'linkedTournament', select: 'name sport' },
];

@Injectable()
export class TripsService {
  constructor(
    @InjectModel(TripEntity.name)
    private readonly tripModel: Model<TripEntity>,
    @InjectModel(PaymentEntity.name)
    private readonly paymentModel: Model<PaymentEntity>,
    private readonly usersService: UsersService,
    private readonly playersService: PlayersService,
  ) {}

  /**
   * Non-admin callers (managers, coordinadores, coaches) sólo pueden agregar como
   * pasajeros staff (Users) cuyas sports/categories intersecten con las suyas —
   * mismo patrón que players.service.ts#update.
   */
  private async assertStaffInCallerScope(userId: string, caller?: User): Promise<void> {
    if (!caller || caller.roles?.includes(RoleEnum.ADMIN)) return;

    const callerSports = (caller.sports ?? []) as string[];
    const callerCategories = (caller.categories ?? []) as string[];
    if (!callerSports.length && !callerCategories.length) return;

    const staffUser = await this.usersService.findById(userId);
    if (!staffUser) throw new NotFoundException('Usuario no encontrado');

    const staffSports = (staffUser.sports ?? []) as string[];
    const staffCategories = (staffUser.categories ?? []) as string[];
    const sportOk = !callerSports.length || staffSports.some((s) => callerSports.includes(s));
    const categoryOk = !callerCategories.length || staffCategories.some((c) => callerCategories.includes(c));
    if (!sportOk || !categoryOk) {
      throw new ForbiddenException('No tenés permisos para agregar staff de esta categoría al viaje');
    }
  }

  async create(dto: CreateTripDto, caller?: User) {
    const callerId = caller ? (caller as any)._id : undefined;
    return this.tripModel.create({
      ...dto,
      costPerPerson: dto.costPerPerson ?? 0,
      status: dto.status ?? 'draft',
      createdBy: callerId,
      updatedBy: callerId,
    });
  }

  async findPaginated(
    pagination: PaginationDto<TripFilterDto>,
    caller?: User
  ): Promise<PaginatedResponse<unknown>> {
    const {
      page,
      size,
      filters = {},
      sortBy,
      sortOrder = SortOrder.DESC,
    } = pagination;
    const skip = (page - 1) * size;
    const query: Record<string, unknown> = {};

    if (filters.searchTerm) {
      const regex = new RegExp(filters.searchTerm, 'i');
      query['$or'] = [{ name: regex }, { destination: regex }];
    }
    if (filters.sport) query['sport'] = filters.sport;
    if (filters.status) query['status'] = filters.status;

    const sort: Record<string, 1 | -1> = sortBy
      ? { [sortBy]: sortOrder === 'asc' ? 1 : -1 }
      : { departureDate: -1 };

    const [items, total] = await Promise.all([
      this.tripModel.find(query).sort(sort).skip(skip).limit(size).exec(),
      this.tripModel.countDocuments(query),
    ]);

    return { items, total, page, size };
  }

  async findOne(id: string) {
    const trip = await this.tripModel
      .findById(id)
      .populate(POPULATE_FIELDS)
      .exec();
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    return trip;
  }

  async update(id: string, dto: UpdateTripDto, caller?: User) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    Object.assign(trip, dto);
    if (caller) trip.updatedBy = (caller as any)._id;
    return trip.save();
  }

  async delete(id: string) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    return trip.deleteOne();
  }

  // ── Participantes ──────────────────────────────────────────────────────────

  async addParticipant(id: string, dto: AddParticipantDto, caller?: User) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const participant: Partial<TripParticipantEntity> = {
      type: dto.type,
      status: dto.status ?? TripParticipantStatusEnum.PENDING,
      costAssigned: dto.costAssigned ?? trip.costPerPerson,
      payments: [],
      specialNeeds: dto.specialNeeds,
    };

    if (dto.type === TripParticipantTypeEnum.PLAYER) {
      if (!dto.playerId) throw new BadRequestException('playerId requerido');
      const alreadyAdded = trip.participants.some(
        (p) => p.player?.toString() === dto.playerId
      );
      if (alreadyAdded) throw new BadRequestException('El jugador ya está en el viaje');
      await this.playersService.findOne(dto.playerId);
      participant.player = new Types.ObjectId(dto.playerId);
    } else if (dto.type === TripParticipantTypeEnum.STAFF) {
      if (!dto.userId) throw new BadRequestException('userId requerido');
      await this.assertStaffInCallerScope(dto.userId, caller);
      participant.user = new Types.ObjectId(dto.userId);
      participant.category = dto.category;
    } else {
      if (!dto.externalName) throw new BadRequestException('externalName requerido');
      participant.externalName = dto.externalName;
      participant.externalDni = dto.externalDni;
      participant.externalRole = dto.externalRole;
      participant.category = dto.category;
    }

    if (dto.accompanyingParticipantId) {
      participant.accompanyingParticipantId = new Types.ObjectId(dto.accompanyingParticipantId);
    }

    if (caller) trip.updatedBy = (caller as any)._id;
    trip.participants.push(participant as TripParticipantEntity);
    await trip.save();

    const newParticipant = trip.participants[trip.participants.length - 1] as any;
    const synced = await this.syncExistingPaymentsToParticipant(trip, newParticipant);
    if (synced) await trip.save();

    return this.findOne(id);
  }

  async bulkAddParticipants(id: string, dtos: AddParticipantDto[], caller?: User) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const existingPlayerIds = new Set(
      trip.participants
        .filter((p) => p.type === TripParticipantTypeEnum.PLAYER)
        .map((p) => p.player?.toString())
    );

    for (const dto of dtos) {
      if (dto.type === TripParticipantTypeEnum.PLAYER) {
        if (!dto.playerId) continue;
        if (existingPlayerIds.has(dto.playerId)) continue;
        try {
          await this.playersService.findOne(dto.playerId);
        } catch {
          continue;
        }
        existingPlayerIds.add(dto.playerId);
        trip.participants.push({
          type: dto.type,
          status: dto.status ?? TripParticipantStatusEnum.PENDING,
          costAssigned: dto.costAssigned ?? trip.costPerPerson,
          payments: [],
          specialNeeds: dto.specialNeeds,
          player: new Types.ObjectId(dto.playerId),
        } as TripParticipantEntity);
      }
    }

    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  async removeAllParticipants(id: string, caller?: User) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    trip.participants = [] as any;
    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  async bulkUpdateStatus(
    id: string,
    participantIds: string[],
    status: TripParticipantStatusEnum,
    caller?: User
  ) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    for (const pid of participantIds) {
      const participant = (trip.participants as any).id(pid);
      if (participant) participant.status = status;
    }

    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  async updateParticipant(
    id: string,
    participantId: string,
    dto: UpdateParticipantDto,
    caller?: User
  ) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const participant = (trip.participants as any).id(participantId);
    if (!participant) throw new NotFoundException('Participante no encontrado');

    if (dto.status !== undefined) participant.status = dto.status;
    if (dto.costAssigned !== undefined) participant.costAssigned = dto.costAssigned;
    if (dto.specialNeeds !== undefined) participant.specialNeeds = dto.specialNeeds;
    if (dto.documentationOk !== undefined) participant.documentationOk = dto.documentationOk;
    if (dto.accompanyingParticipantId !== undefined) {
      participant.accompanyingParticipantId = dto.accompanyingParticipantId
        ? new Types.ObjectId(dto.accompanyingParticipantId)
        : undefined;
    }

    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  private async syncExistingPaymentsToParticipant(
    trip: TripEntity,
    participant: any,
  ): Promise<boolean> {
    const query: Record<string, unknown> = {
      entityType: PaymentEntityTypeEnum.TRIP,
      entityId: (trip as any)._id,
      status: PaymentStatusEnum.APPROVED,
    };

    if (participant.type === TripParticipantTypeEnum.PLAYER && participant.player) {
      query['playerId'] = participant.player;
    } else if (participant.type === TripParticipantTypeEnum.STAFF && participant.user) {
      query['userId'] = participant.user;
    } else if (participant.type === TripParticipantTypeEnum.EXTERNAL && participant.externalDni) {
      query['payerDni'] = participant.externalDni;
    } else {
      return false;
    }

    const payments = await this.paymentModel.find(query).lean();
    if (payments.length === 0) return false;

    for (const payment of payments) {
      const alreadySynced = participant.payments.some(
        (p: any) => p.sourcePaymentId?.toString() === (payment as any)._id.toString(),
      );
      if (!alreadySynced) {
        participant.payments.push({
          amount: payment.amount,
          date: payment.date ?? new Date(),
          method: payment.method,
          notes: payment.notes,
          sourcePaymentId: (payment as any)._id,
        });
      }
    }

    const totalPaid = participant.payments.reduce((sum: number, p: any) => sum + p.amount, 0);
    if (participant.costAssigned > 0 && totalPaid >= participant.costAssigned) {
      participant.status = TripParticipantStatusEnum.CONFIRMED;
    }

    return true;
  }

  async bulkRemoveParticipants(id: string, participantIds: string[], caller?: User) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    for (const pid of participantIds) {
      const participant = (trip.participants as any).id(pid);
      if (participant) participant.deleteOne();
    }

    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  async removeParticipant(id: string, participantId: string, caller?: User) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const participant = (trip.participants as any).id(participantId);
    if (!participant) throw new NotFoundException('Participante no encontrado');

    participant.deleteOne();
    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  // ── Pagos ──────────────────────────────────────────────────────────────────

  async recordPayment(
    id: string,
    participantId: string,
    dto: RecordPaymentDto,
    caller?: User
  ) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const participant = (trip.participants as any).id(participantId);
    if (!participant) throw new NotFoundException('Participante no encontrado');

    participant.payments.push({
      amount: dto.amount,
      date: new Date(dto.date),
      notes: dto.notes,
      recordedBy: caller ? (caller as any)._id : undefined,
    });

    const totalPaid = participant.payments.reduce((sum: number, p: any) => sum + p.amount, 0);
    if (participant.costAssigned > 0 && totalPaid >= participant.costAssigned) {
      participant.status = TripParticipantStatusEnum.CONFIRMED;
    }

    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  async removePayment(
    id: string,
    participantId: string,
    paymentId: string,
    caller?: User
  ) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const participant = (trip.participants as any).id(participantId);
    if (!participant) throw new NotFoundException('Participante no encontrado');

    const payment = (participant.payments as any).id(paymentId);
    if (!payment) throw new NotFoundException('Pago no encontrado');

    payment.deleteOne();

    const totalPaid = participant.payments.reduce((sum: number, p: any) => sum + p.amount, 0);
    if (participant.status === TripParticipantStatusEnum.CONFIRMED) {
      if (participant.costAssigned === 0 || totalPaid < participant.costAssigned) {
        participant.status = TripParticipantStatusEnum.PENDING;
      }
    }

    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  // ── Transportes ───────────────────────────────────────────────────────────

  async addTransport(id: string, dto: AddTransportDto, caller?: User) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    trip.transports.push(dto as unknown as TripTransportEntity);
    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  async updateTransport(
    id: string,
    transportId: string,
    dto: UpdateTransportDto,
    caller?: User
  ) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const transport = (trip.transports as any).id(transportId);
    if (!transport) throw new NotFoundException('Transporte no encontrado');

    Object.assign(transport, dto);
    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  async removeTransport(id: string, transportId: string, caller?: User) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const transport = (trip.transports as any).id(transportId);
    if (!transport) throw new NotFoundException('Transporte no encontrado');

    // Limpiar asignaciones de participantes a este transporte
    const tid = new Types.ObjectId(transportId);
    for (const p of trip.participants) {
      if (p.transportId?.equals(tid)) {
        p.transportId = undefined;
        p.seatNumber = undefined;
      }
    }

    transport.deleteOne();
    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  async moveParticipant(
    id: string,
    participantId: string,
    dto: MoveParticipantDto,
    caller?: User
  ) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const participant = (trip.participants as any).id(participantId);
    if (!participant) throw new NotFoundException('Participante no encontrado');

    if (dto.transportId) {
      const transport = (trip.transports as any).id(dto.transportId);
      if (!transport) throw new NotFoundException('Transporte no encontrado');
      participant.transportId = new Types.ObjectId(dto.transportId);
    } else {
      participant.transportId = undefined;
      participant.seatNumber = undefined;
    }

    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  // ── Draft automático de transporte ────────────────────────────────────────

  async draftTransportAssignment(id: string, caller?: User) {
    const trip = await this.tripModel
      .findById(id)
      .populate([
        { path: 'participants.player', select: 'category sport' },
        { path: 'participants.user', select: 'categories sports' },
      ])
      .exec();

    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (!trip.transports.length) {
      throw new BadRequestException('El viaje no tiene transportes definidos');
    }

    const confirmed = trip.participants.filter(
      (p) => p.status === TripParticipantStatusEnum.CONFIRMED
    );

    const players = confirmed.filter((p) => p.type === TripParticipantTypeEnum.PLAYER);
    const staff = confirmed.filter((p) => p.type === TripParticipantTypeEnum.STAFF);
    const externals = confirmed.filter((p) => p.type === TripParticipantTypeEnum.EXTERNAL);

    // Ordenar transportes de mayor a menor capacidad
    const transports = [...trip.transports].sort((a, b) => b.capacity - a.capacity);

    // Loads actuales (empezamos desde 0 — el draft reemplaza asignaciones)
    const loads = new Map<string, number>(transports.map((t) => [t._id.toString(), 0]));
    const assignments = new Map<string, string>(); // participantId → transportId

    // 1. Agrupar jugadores por categoría
    const byCat = new Map<CategoryEnum, TripParticipantEntity[]>();
    for (const p of players) {
      const cat = (p.player as any)?.category as CategoryEnum | undefined;
      if (!cat) continue;
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(p);
    }

    // 2. Ordenar categorías por rank etario
    const sortedCats = [...byCat.keys()].sort(
      (a, b) => (CATEGORY_AGE_RANK[a] ?? 99) - (CATEGORY_AGE_RANK[b] ?? 99)
    );

    // 3. Clusterizar categorías (gap ≤ MAX_CATEGORY_AGE_GAP)
    const clusters: CategoryEnum[][] = [];
    let current: CategoryEnum[] = [];
    for (const cat of sortedCats) {
      if (!current.length) {
        current.push(cat);
      } else {
        const last = current[current.length - 1];
        const gap = Math.abs(
          (CATEGORY_AGE_RANK[cat] ?? 99) - (CATEGORY_AGE_RANK[last] ?? 99)
        );
        if (gap <= MAX_CATEGORY_AGE_GAP) {
          current.push(cat);
        } else {
          clusters.push(current);
          current = [cat];
        }
      }
    }
    if (current.length) clusters.push(current);

    // Track which categories are assigned to each transport (for compatibility checks)
    const transportCats = new Map<string, Set<CategoryEnum>>(
      transports.map((t) => [t._id.toString(), new Set<CategoryEnum>()])
    );

    const isCompatibleWithTransport = (tid: string, cluster: CategoryEnum[]): boolean => {
      const existing = transportCats.get(tid);
      if (!existing || existing.size === 0) return true;
      for (const existingCat of existing) {
        for (const newCat of cluster) {
          const gap = Math.abs(
            (CATEGORY_AGE_RANK[existingCat] ?? 99) - (CATEGORY_AGE_RANK[newCat] ?? 99)
          );
          if (gap > MAX_CATEGORY_AGE_GAP) return false;
        }
      }
      return true;
    };

    // 4. Asignar clusters a transportes
    const unassignedClusters: CategoryEnum[][] = [];
    for (const cluster of clusters) {
      const clusterPlayers = cluster.flatMap((c) => byCat.get(c) ?? []);
      const needed = clusterPlayers.length;
      const transport = transports.find((t) => {
        const tid = t._id.toString();
        const hasSpace = t.capacity - (loads.get(tid) ?? 0) >= needed;
        return hasSpace && isCompatibleWithTransport(tid, cluster);
      });
      if (transport) {
        const tid = transport._id.toString();
        for (const p of clusterPlayers) {
          assignments.set(p._id.toString(), tid);
          loads.set(tid, (loads.get(tid) ?? 0) + 1);
        }
        for (const cat of cluster) transportCats.get(tid)!.add(cat);
      } else {
        unassignedClusters.push(cluster);
      }
    }

    // 5. Clusters que no cupieron: partir por categoría más vieja primero (R3)
    for (const cluster of unassignedClusters) {
      const catsSorted = [...cluster].sort(
        (a, b) => (CATEGORY_AGE_RANK[b] ?? 99) - (CATEGORY_AGE_RANK[a] ?? 99) // desc → más vieja primero
      );
      for (const cat of catsSorted) {
        const catPlayers = byCat.get(cat) ?? [];
        const transport = transports.find(
          (t) => t.capacity - (loads.get(t._id.toString()) ?? 0) >= catPlayers.length
        );
        if (transport) {
          const tid = transport._id.toString();
          for (const p of catPlayers) {
            assignments.set(p._id.toString(), tid);
            loads.set(tid, (loads.get(tid) ?? 0) + 1);
          }
        } else {
          // Último recurso: asignar de a uno al transporte con más espacio
          for (const p of catPlayers) {
            const t = transports
              .filter((t) => t.capacity - (loads.get(t._id.toString()) ?? 0) > 0)
              .sort(
                (a, b) =>
                  (b.capacity - (loads.get(b._id.toString()) ?? 0)) -
                  (a.capacity - (loads.get(a._id.toString()) ?? 0))
              )[0];
            if (t) {
              const tid = t._id.toString();
              assignments.set(p._id.toString(), tid);
              loads.set(tid, (loads.get(tid) ?? 0) + 1);
            }
          }
        }
      }
    }

    // 6. Asignar staff al transporte de sus categorías (R4)
    for (const s of staff) {
      const userCats: CategoryEnum[] = (s.user as any)?.categories ?? [];
      let targetTid: string | undefined;
      let bestMatch = -1;

      for (const t of transports) {
        const tid = t._id.toString();
        const playersHere = players.filter((p) => assignments.get(p._id.toString()) === tid);
        const matchCount = playersHere.filter((p) => {
          const cat = (p.player as any)?.category as CategoryEnum | undefined;
          return cat && userCats.includes(cat);
        }).length;
        if (matchCount > bestMatch) {
          bestMatch = matchCount;
          targetTid = tid;
        }
      }

      // Si no hay match por categoría, ir al transporte con más espacio
      if (!targetTid || bestMatch === 0) {
        const t = transports
          .filter((t) => t.capacity - (loads.get(t._id.toString()) ?? 0) > 0)
          .sort(
            (a, b) =>
              (b.capacity - (loads.get(b._id.toString()) ?? 0)) -
              (a.capacity - (loads.get(a._id.toString()) ?? 0))
          )[0];
        if (t) targetTid = t._id.toString();
      }

      if (targetTid) {
        assignments.set(s._id.toString(), targetTid);
        loads.set(targetTid, (loads.get(targetTid) ?? 0) + 1);
      }
    }

    // 7. Asignar externos/acompañantes (R5)
    for (const e of externals) {
      const accompId = e.accompanyingParticipantId?.toString();
      let targetTid = accompId ? assignments.get(accompId) : undefined;

      if (!targetTid) {
        const t = transports
          .filter((t) => t.capacity - (loads.get(t._id.toString()) ?? 0) > 0)
          .sort(
            (a, b) =>
              (b.capacity - (loads.get(b._id.toString()) ?? 0)) -
              (a.capacity - (loads.get(a._id.toString()) ?? 0))
          )[0];
        if (t) targetTid = t._id.toString();
      }

      if (targetTid) {
        assignments.set(e._id.toString(), targetTid);
        loads.set(targetTid, (loads.get(targetTid) ?? 0) + 1);
      }
    }

    // 8. Aplicar asignaciones
    for (const p of trip.participants) {
      const tid = assignments.get(p._id.toString());
      p.transportId = tid ? new Types.ObjectId(tid) : undefined;
    }

    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  // ── Alojamientos ─────────────────────────────────────────────────────────

  async addLodging(id: string, dto: AddLodgingDto, caller?: User) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    trip.lodgings.push(dto as unknown as TripLodgingEntity);
    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  async updateLodging(
    id: string,
    lodgingId: string,
    dto: UpdateLodgingDto,
    caller?: User
  ) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const lodging = (trip.lodgings as any).id(lodgingId);
    if (!lodging) throw new NotFoundException('Alojamiento no encontrado');

    Object.assign(lodging, dto);
    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  async removeLodging(id: string, lodgingId: string, caller?: User) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const lodging = (trip.lodgings as any).id(lodgingId);
    if (!lodging) throw new NotFoundException('Alojamiento no encontrado');

    // Limpiar asignaciones de participantes a este alojamiento
    const lid = new Types.ObjectId(lodgingId);
    for (const p of trip.participants) {
      if (p.lodgingId?.equals(lid)) {
        p.lodgingId = undefined;
        p.roomNumber = undefined;
      }
    }

    lodging.deleteOne();
    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  async moveParticipantLodging(
    id: string,
    participantId: string,
    dto: MoveParticipantLodgingDto,
    caller?: User
  ) {
    const trip = await this.tripModel.findById(id);
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const participant = (trip.participants as any).id(participantId);
    if (!participant) throw new NotFoundException('Participante no encontrado');

    if (dto.lodgingId !== undefined) {
      if (dto.lodgingId) {
        const lodging = (trip.lodgings as any).id(dto.lodgingId);
        if (!lodging) throw new NotFoundException('Alojamiento no encontrado');
        participant.lodgingId = new Types.ObjectId(dto.lodgingId);
      } else {
        participant.lodgingId = undefined;
      }
      participant.roomNumber = undefined;
    }

    if (dto.roomNumber !== undefined) {
      participant.roomNumber = dto.roomNumber || undefined;
    }

    if (caller) trip.updatedBy = (caller as any)._id;
    await trip.save();
    return this.findOne(id);
  }

  async getPublicTripInfo(id: string) {
    const trip = await this.tripModel
      .findById(id)
      .select('name destination departureDate returnDate transports')
      .lean()
      .exec();
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    return {
      name: trip.name,
      destination: trip.destination,
      departureDate: trip.departureDate,
      returnDate: trip.returnDate,
    };
  }

  async lookupAuthorizationByDni(tripId: string, dni: string) {
    const trip = await this.tripModel
      .findById(tripId)
      .populate([{ path: 'participants.player', select: 'name idNumber' }])
      .lean()
      .exec();
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    const normalizedDni = dni.replace(/\D/g, '');

    const participant = trip.participants.find((p) => {
      if (p.externalDni) return p.externalDni.replace(/\D/g, '') === normalizedDni;
      const player = p.player as any;
      return player?.idNumber?.replace(/\D/g, '') === normalizedDni;
    });

    if (!participant) throw new NotFoundException('No se encontró un pasajero con ese DNI');

    const player = participant.player as any;
    const name = participant.externalName ?? player?.name ?? '';

    const transport = participant.transportId
      ? trip.transports.find((t: any) => t._id.toString() === participant.transportId.toString())
      : undefined;

    return {
      passengerName: name,
      passengerDni: dni,
      transportCompany: transport?.company ?? transport?.name ?? null,
      tripName: trip.name,
      destination: trip.destination,
      departureDate: trip.departureDate,
      returnDate: trip.returnDate,
    };
  }
}
