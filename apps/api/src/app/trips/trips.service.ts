import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TripEntity, TripParticipantEntity, TripTransportEntity } from './schemas/trip.entity';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripFilterDto } from './dto/trip-filter.dto';
import { AddParticipantDto } from './dto/add-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { AddTransportDto } from './dto/add-transport.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';
import { MoveParticipantDto } from './dto/move-participant.dto';
import { PaginationDto } from '../shared/pagination.dto';
import {
  CategoryEnum,
  CATEGORY_AGE_RANK,
  MAX_CATEGORY_AGE_GAP,
  PaginatedResponse,
  SortOrder,
  TripParticipantTypeEnum,
  TripParticipantStatusEnum,
} from '@ltrc-campo/shared-api-model';
import { User } from '../users/schemas/user.schema';

const POPULATE_FIELDS = [
  { path: 'participants.player', select: 'name category sport idNumber' },
  { path: 'participants.user', select: 'name email idNumber categories sports' },
  { path: 'linkedTournament', select: 'name sport' },
];

@Injectable()
export class TripsService {
  constructor(
    @InjectModel(TripEntity.name)
    private readonly tripModel: Model<TripEntity>
  ) {}

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
      status: dto.status ?? TripParticipantStatusEnum.INTERESTED,
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
      participant.player = new Types.ObjectId(dto.playerId);
    } else if (dto.type === TripParticipantTypeEnum.STAFF) {
      if (!dto.userId) throw new BadRequestException('userId requerido');
      participant.user = new Types.ObjectId(dto.userId);
    } else {
      if (!dto.externalName) throw new BadRequestException('externalName requerido');
      participant.externalName = dto.externalName;
      participant.externalDni = dto.externalDni;
      participant.externalRole = dto.externalRole;
    }

    if (dto.accompanyingParticipantId) {
      participant.accompanyingParticipantId = new Types.ObjectId(dto.accompanyingParticipantId);
    }

    if (caller) trip.updatedBy = (caller as any)._id;
    trip.participants.push(participant as TripParticipantEntity);
    await trip.save();
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
        existingPlayerIds.add(dto.playerId);
        trip.participants.push({
          type: dto.type,
          status: dto.status ?? TripParticipantStatusEnum.INTERESTED,
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
}
