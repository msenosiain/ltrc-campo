import {
  BadRequestException,
  GoneException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import MercadoPagoConfig, { Payment as MpPayment, Preference } from 'mercadopago';
import { PaymentLinkEntity } from './schemas/payment-link.entity';
import { PaymentEntity } from './schemas/payment.entity';
import { PaymentConfigEntity, PAYMENT_CONFIG_MODEL } from './schemas/payment-config.entity';
import { PlayerEntity } from '../players/schemas/player.entity';
import { MatchEntity } from '../matches/schemas/match.entity';
import { TripEntity } from '../trips/schemas/trip.entity';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import { RecordManualPaymentDto } from './dto/record-manual-payment.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { User } from '../users/schemas/user.schema';
import {
  CategoryEnum,
  PaymentEntityTypeEnum,
  PaymentLinkStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  TripParticipantStatusEnum,
  TripParticipantTypeEnum,
  getCategoryLabel,
} from '@ltrc-campo/shared-api-model';

@Injectable()
export class PaymentsService {
  private readonly mpClient: MercadoPagoConfig;
  private readonly appBaseUrl: string;
  private readonly mpFeeRate: number;
  private readonly mpWebhookSecret: string;

  constructor(
    @InjectModel(PaymentLinkEntity.name)
    private readonly paymentLinkModel: Model<PaymentLinkEntity>,
    @InjectModel(PaymentEntity.name)
    private readonly paymentModel: Model<PaymentEntity>,
    @InjectModel(PAYMENT_CONFIG_MODEL)
    private readonly paymentConfigModel: Model<PaymentConfigEntity>,
    @InjectModel(PlayerEntity.name)
    private readonly playerModel: Model<PlayerEntity>,
    @InjectModel(MatchEntity.name)
    private readonly matchModel: Model<MatchEntity>,
    @InjectModel(TripEntity.name)
    private readonly tripModel: Model<TripEntity>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly configService: ConfigService
  ) {
    // MP_FEE_RATE se configura como porcentaje (ej: 5 = 5%, 4.83 = 4.83%)
    const feePercent = this.configService.get<number>('MP_FEE_RATE', 4.83);
    this.mpFeeRate = feePercent / 100;
    this.mpClient = new MercadoPagoConfig({
      accessToken: this.configService.get<string>('MP_ACCESS_TOKEN', ''),
    });
    this.appBaseUrl = this.configService.get<string>(
      'APP_BASE_URL',
      'http://localhost:4200'
    );
    this.mpWebhookSecret = this.configService.get<string>('MP_WEBHOOK_SECRET', '');
  }

  // ── Cálculo de comisión ────────────────────────────────────────────────────

  calculateFee(netTarget: number) {
    // El manager ingresa lo que quiere recibir neto; calculamos el bruto que paga el jugador
    const rawGross = netTarget / (1 - this.mpFeeRate);
    const grossAmount = Math.ceil(rawGross / 10) * 10;
    const mpFeeAmount = Math.round(grossAmount * this.mpFeeRate * 100) / 100;
    const netAmount = Math.round((grossAmount - mpFeeAmount) * 100) / 100;
    return { mpFeeRate: this.mpFeeRate, grossAmount, mpFeeAmount, netAmount };
  }

  async getConfig() {
    const config = await this.paymentConfigModel.findOne().lean();
    return {
      mpFeeRate: this.mpFeeRate,
      excludedPaymentTypes: config?.excludedPaymentTypes ?? [],
    };
  }

  async updatePaymentConfig(excludedPaymentTypes: string[]) {
    const config = await this.paymentConfigModel.findOneAndUpdate(
      {},
      { excludedPaymentTypes },
      { upsert: true, new: true }
    ).lean();
    return { excludedPaymentTypes: config?.excludedPaymentTypes ?? [] };
  }

  async getFieldOptions() {
    const concepts = await this.paymentLinkModel.distinct('concept');
    return { concepts: concepts.sort() };
  }

  // ── PaymentLinks ──────────────────────────────────────────────────────────

  async createLink(dto: CreatePaymentLinkDto, caller: User) {
    if (!dto.entityId && (!dto.entityIds?.length)) {
      throw new BadRequestException('Se requiere entityId o entityIds');
    }
    const entityId = dto.entityId
      ? new Types.ObjectId(dto.entityId)
      : new Types.ObjectId(dto.entityIds![0]);
    const entityIds = dto.entityIds?.length
      ? dto.entityIds.map((id) => new Types.ObjectId(id))
      : undefined;

    const { mpFeeRate, grossAmount, mpFeeAmount, netAmount } = this.calculateFee(dto.amount);

    return this.paymentLinkModel.create({
      linkToken: uuidv4(),
      entityType: dto.entityType,
      entityId,
      entityIds,
      concept: dto.concept,
      description: dto.description,
      amount: grossAmount,
      mpFeeRate,
      mpFeeAmount,
      netAmount,
      paymentType: dto.paymentType,
      installmentNumber: dto.installmentNumber,
      installmentTotal: dto.installmentTotal,
      expiresAt: new Date(dto.expiresAt),
      status: PaymentLinkStatusEnum.ACTIVE,
      createdBy: (caller as any)._id,
    });
  }

  async getLinksForEntity(entityType: PaymentEntityTypeEnum, entityId: string) {
    const oid = new Types.ObjectId(entityId);
    return this.paymentLinkModel
      .find({ entityType, $or: [{ entityId: oid }, { entityIds: oid }] })
      .sort({ createdAt: -1 });
  }

  async cancelLink(id: string) {
    const link = await this.paymentLinkModel.findById(id);
    if (!link) throw new NotFoundException('Link de pago no encontrado');
    link.status = PaymentLinkStatusEnum.CANCELLED;
    return link.save();
  }

  // ── Endpoints públicos ────────────────────────────────────────────────────

  async getPublicLinkInfo(token: string) {
    const link = await this.paymentLinkModel.findOne({ linkToken: token }).lean();
    if (!link) throw new NotFoundException('Link de pago no encontrado');
    this.assertLinkActive(link);

    const [entityLabel, matchInfo] = await Promise.all([
      this.resolveEntityLabel(link.entityType, link.entityId.toString(), link.entityIds),
      this.resolveMatchInfo(link.entityType, link.entityId.toString(), link.entityIds),
    ]);

    return {
      linkToken: link.linkToken,
      concept: link.concept,
      description: link.description,
      amount: link.amount,
      mpFeeRate: link.mpFeeRate,
      mpFeeAmount: link.mpFeeAmount,
      netAmount: link.netAmount,
      paymentType: link.paymentType,
      installmentNumber: link.installmentNumber,
      installmentTotal: link.installmentTotal,
      expiresAt: link.expiresAt,
      entityType: link.entityType,
      entityLabel,
      matchDate: matchInfo?.date,
      matchTime: matchInfo?.time,
      matchOpponents: matchInfo?.opponents,
      matchCategories: matchInfo?.categories,
      matchTournamentName: matchInfo?.tournamentName,
    };
  }

  private async resolveTripPayer(tripId: string, dni: string): Promise<{
    payerId: { playerId?: Types.ObjectId; userId?: Types.ObjectId };
    payerName: string;
  }> {
    const trip = await this.tripModel.findById(tripId).select('participants').lean();
    if (!trip) throw new NotFoundException('Viaje no encontrado');

    // 1. Jugador
    const player = await this.playerModel.findOne({ idNumber: dni }).select('id name idNumber').lean();
    if (player) {
      const p = trip.participants.find(
        (p) =>
          p.type === TripParticipantTypeEnum.PLAYER &&
          p.player?.toString() === player._id.toString(),
      );
      if (!p) throw new HttpException({ code: 'NOT_A_PARTICIPANT', payerName: player.name }, 400);
      if (p.costAssigned === 0) throw new HttpException({ code: 'NO_PAYMENT_REQUIRED', payerName: player.name }, 400);
      return { payerId: { playerId: player._id }, payerName: player.name };
    }

    // 2. Staff (usuario del sistema)
    const user = await this.userModel.findOne({ idNumber: dni }).select('id name idNumber').lean();
    if (user) {
      const p = trip.participants.find(
        (p) =>
          p.type === TripParticipantTypeEnum.STAFF &&
          (p as any).user?.toString() === user._id.toString(),
      );
      if (!p) throw new HttpException({ code: 'NOT_A_PARTICIPANT', payerName: user.name }, 400);
      if (p.costAssigned === 0) throw new HttpException({ code: 'NO_PAYMENT_REQUIRED', payerName: user.name }, 400);
      return { payerId: { userId: user._id }, payerName: user.name };
    }

    // 3. Externo (padre / acompañante sin cuenta)
    const ext = trip.participants.find(
      (p) =>
        p.type === TripParticipantTypeEnum.EXTERNAL &&
        p.externalDni === dni,
    );
    if (ext) {
      if (ext.costAssigned === 0) throw new HttpException({ code: 'NO_PAYMENT_REQUIRED', payerName: ext.externalName }, 400);
      return { payerId: {}, payerName: ext.externalName ?? 'Participante' };
    }

    throw new NotFoundException('No se encontró ninguna persona con ese DNI en el viaje');
  }

  async validateDni(token: string, dni: string) {
    const link = await this.paymentLinkModel.findOne({ linkToken: token });
    if (!link) throw new NotFoundException('Link de pago no encontrado');
    this.assertLinkActive(link);

    if (link.entityType === PaymentEntityTypeEnum.TRIP) {
      const { payerName } = await this.resolveTripPayer(link.entityId.toString(), dni);
      return { playerName: payerName };
    }

    // Partidos: buscar solo jugadores
    const player = await this.playerModel
      .findOne({ idNumber: dni })
      .select('id name idNumber email category')
      .lean();
    if (!player) throw new NotFoundException('No se encontró un jugador con ese DNI');

    if (link.entityIds?.length) {
      const matches = await this.matchModel.find({ _id: { $in: link.entityIds } }).select('category').lean();
      const matchForPlayer = matches.find((m) => m.category === player.category);
      if (!matchForPlayer) throw new HttpException({ code: 'CATEGORY_NOT_IN_GROUP', playerCategory: player.category }, 400);
    } else if (link.entityType === PaymentEntityTypeEnum.MATCH && player.category) {
      const match = await this.matchModel.findById(link.entityId).select('category').lean();
      if (match?.category && match.category !== player.category) {
        throw new HttpException({ code: 'CATEGORY_MISMATCH', playerCategory: player.category, matchCategory: match.category }, 400);
      }
    }

    return { playerId: player._id.toString(), playerName: player.name };
  }

  async initiateCheckout(token: string, dni: string) {
    const link = await this.paymentLinkModel.findOne({ linkToken: token });
    if (!link) throw new NotFoundException('Link de pago no encontrado');
    this.assertLinkActive(link);

    let payerId: { playerId?: Types.ObjectId; userId?: Types.ObjectId } = {};
    let payerName: string;
    let payerDni: string = dni;
    let targetEntityId: Types.ObjectId = link.entityId;

    if (link.entityType === PaymentEntityTypeEnum.TRIP) {
      const resolved = await this.resolveTripPayer(link.entityId.toString(), dni);
      payerId = resolved.payerId;
      payerName = resolved.payerName;
    } else {
      const player = await this.playerModel
        .findOne({ idNumber: dni })
        .select('id name idNumber email category')
        .lean();
      if (!player) throw new NotFoundException('No se encontró un jugador con ese DNI');
      payerId = { playerId: player._id };
      payerName = player.name;
      payerDni = player.idNumber ?? dni;

      // Para links de jornada: resolver el partido correcto según categoría del jugador
      if (link.entityIds?.length) {
      const matches = await this.matchModel
        .find({ _id: { $in: link.entityIds } })
        .select('category')
        .lean();
      const matchForPlayer = matches.find((m) => m.category === player.category);
      if (!matchForPlayer) {
        throw new HttpException(
          { code: 'CATEGORY_NOT_IN_GROUP', playerCategory: player.category },
          400
        );
      }
      targetEntityId = (matchForPlayer as any)._id;
    } else if (link.entityType === PaymentEntityTypeEnum.MATCH && player.category) {
      const match = await this.matchModel.findById(link.entityId).select('category').lean();
      if (match?.category && match.category !== player.category) {
        throw new HttpException({ code: 'CATEGORY_MISMATCH', playerCategory: player.category, matchCategory: match.category }, 400);
      }
    }
    } // end else (non-trip)

    const externalReference = uuidv4();

    // Crea registro de pago pendiente
    const payment = await this.paymentModel.create({
      paymentLinkId: link._id,
      entityType: link.entityType,
      entityId: targetEntityId,
      ...payerId,
      payerName,
      payerDni,
      amount: link.amount,
      method: PaymentMethodEnum.MERCADOPAGO,
      status: PaymentStatusEnum.PENDING,
      concept: link.concept,
      mpExternalReference: externalReference,
      date: new Date(),
    });

    const entityLabel = await this.resolveEntityLabel(
      link.entityType,
      link.entityId.toString()
    );

    // Crea preferencia en MP
    const paymentConfig = await this.paymentConfigModel.findOne().lean();
    const excludedTypes = paymentConfig?.excludedPaymentTypes ?? [];

    const preference = new Preference(this.mpClient);
    const mpResponse = await preference.create({
      body: {
        items: [
          {
            id: payment.id,
            title: `${link.concept} - ${entityLabel}`,
            description: link.description ?? link.concept,
            quantity: 1,
            unit_price: link.amount,
            currency_id: 'ARS',
          },
        ],
        payer: {
          name: payerName,
          identification: { type: 'DNI', number: payerDni },
        },
        external_reference: externalReference,
        ...(excludedTypes.length > 0 ? {
          payment_methods: {
            excluded_payment_types: excludedTypes.map((id) => ({ id })),
          },
        } : {}),
        back_urls: {
          success: `${this.appBaseUrl}/pay/result`,
          failure: `${this.appBaseUrl}/pay/result`,
          pending: `${this.appBaseUrl}/pay/result`,
        },
        ...(this.appBaseUrl.startsWith('https://') ? { auto_return: 'approved' as const } : {}),
        expiration_date_to: link.expiresAt.toISOString(),
      },
    });

    // Guarda el preference ID en el pago
    await this.paymentModel.findByIdAndUpdate(payment.id, {
      mpPreferenceId: mpResponse.id,
    });

    const checkoutUrl = this.appBaseUrl.startsWith('https://')
      ? mpResponse.init_point
      : (mpResponse.sandbox_init_point ?? mpResponse.init_point);
    return { checkoutUrl };
  }

  async confirmPayment(dto: ConfirmPaymentDto) {
    const payment = await this.paymentModel.findOne({
      mpExternalReference: dto.externalReference,
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');

    // Si MP no envió payment_id (ej: pago pendiente o error de red), guardamos el status del redirect
    if (!dto.paymentId) {
      payment.status = this.mapMpStatus(dto.status ?? 'pending');
      await payment.save();
      return { status: payment.status };
    }

    // Verificamos contra la API de MP para no confiar solo en los query params del redirect
    try {
      const mpPayment = new MpPayment(this.mpClient);
      const mpData = await mpPayment.get({ id: dto.paymentId });

      payment.mpPaymentId = String(mpData.id);
      payment.mpStatusDetail = mpData.status_detail ?? undefined;
      payment.status = this.mapMpStatus(mpData.status ?? 'pending');
      payment.date = mpData.date_approved
        ? new Date(mpData.date_approved)
        : new Date();
      await payment.save();
      if (payment.status === PaymentStatusEnum.APPROVED) {
        await this.autoConfirmTripParticipantIfNeeded(payment);
      }
    } catch {
      // Si falla la verificación con MP, guardamos lo que vino del redirect
      payment.status = this.mapMpStatus(dto.status ?? 'pending');
      await payment.save();
    }

    return { status: payment.status };
  }

  // ── Pagos manuales ────────────────────────────────────────────────────────

  async recordManualPayment(dto: RecordManualPaymentDto, caller: User) {
    const player = await this.playerModel.findById(dto.playerId).select('id').lean();
    if (!player) throw new NotFoundException('Jugador no encontrado');

    const payment = await this.paymentModel.create({
      entityType: dto.entityType,
      entityId: new Types.ObjectId(dto.entityId),
      playerId: new Types.ObjectId(dto.playerId),
      amount: dto.amount,
      method: dto.method,
      status: PaymentStatusEnum.APPROVED,
      concept: dto.concept,
      date: new Date(dto.date),
      notes: dto.notes,
      recordedBy: (caller as any)._id,
    });

    if (dto.entityType === PaymentEntityTypeEnum.TRIP) {
      await this.syncManualPaymentToTripParticipant(payment);
    }

    return payment;
  }

  async getPaymentsForEntity(entityType: PaymentEntityTypeEnum, entityId: string) {
    return this.paymentModel
      .find({ entityType, entityId: new Types.ObjectId(entityId) })
      .populate({ path: 'playerId', select: 'name idNumber' })
      .sort({ date: -1 });
  }

  async findPlayerByDni(dni: string) {
    const player = await this.playerModel
      .findOne({ idNumber: dni })
      .select('id name idNumber')
      .lean();
    if (!player) throw new NotFoundException('No se encontró un jugador con ese DNI');
    return { playerId: player._id.toString(), playerName: player.name };
  }

  async deleteManualPayment(id: string) {
    const payment = await this.paymentModel.findById(id);
    if (!payment) throw new NotFoundException('Pago no encontrado');
    if (payment.method === PaymentMethodEnum.MERCADOPAGO) {
      throw new BadRequestException('No se pueden eliminar pagos de Mercado Pago');
    }
    if (payment.entityType === PaymentEntityTypeEnum.TRIP) {
      await this.removeManualPaymentFromTripParticipant(payment);
    }
    await payment.deleteOne();
  }

  // ── MP Sync ───────────────────────────────────────────────────────────────

  async syncPaymentById(id: string) {
    const payment = await this.paymentModel.findById(id);
    if (!payment) throw new NotFoundException('Pago no encontrado');
    if (payment.method !== PaymentMethodEnum.MERCADOPAGO) {
      throw new BadRequestException('Solo se pueden sincronizar pagos de Mercado Pago');
    }
    return this.syncWithMp(payment);
  }

  async syncPaymentByMpId(mpPaymentId: string) {
    const payment = await this.paymentModel.findOne({ mpPaymentId });
    if (!payment) return;
    await this.syncWithMp(payment);
  }

  async syncAllPending(): Promise<{ synced: number; updated: number }> {
    const pending = await this.paymentModel.find({
      method: PaymentMethodEnum.MERCADOPAGO,
      status: PaymentStatusEnum.PENDING,
    });
    let updated = 0;
    for (const payment of pending) {
      const result = await this.syncWithMp(payment);
      if (result.updated) updated++;
    }
    return { synced: pending.length, updated };
  }

  private async syncWithMp(payment: PaymentEntity): Promise<{ status: string; updated: boolean }> {
    const previousStatus = payment.status;
    const mpPaymentApi = new MpPayment(this.mpClient);

    try {
      let mpData: Awaited<ReturnType<typeof mpPaymentApi.get>> | undefined;

      if (payment.mpPaymentId) {
        mpData = await mpPaymentApi.get({ id: payment.mpPaymentId });
      } else if (payment.mpExternalReference) {
        const search = await mpPaymentApi.search({
          options: { external_reference: payment.mpExternalReference },
        });
        mpData = search.results?.[0] as unknown as typeof mpData;
      }

      if (!mpData) return { status: payment.status, updated: false };

      payment.mpPaymentId = String(mpData.id);
      payment.mpStatusDetail = (mpData as any).status_detail ?? undefined;
      payment.status = this.mapMpStatus((mpData as any).status ?? 'pending');
      if ((mpData as any).status === 'approved' && !payment.date) {
        payment.date = (mpData as any).date_approved
          ? new Date((mpData as any).date_approved)
          : new Date();
      }
      await payment.save();
      if (payment.status === PaymentStatusEnum.APPROVED) {
        await this.autoConfirmTripParticipantIfNeeded(payment);
      }

      return { status: payment.status, updated: payment.status !== previousStatus };
    } catch {
      return { status: payment.status, updated: false };
    }
  }

  private async syncManualPaymentToTripParticipant(payment: PaymentEntity): Promise<void> {
    const trip = await this.tripModel.findById(payment.entityId);
    if (!trip) return;

    const participant: any = trip.participants.find(
      (p) => p.type === TripParticipantTypeEnum.PLAYER && p.player?.toString() === payment.playerId!.toString(),
    );
    if (!participant) return;

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

    const totalPaid = participant.payments.reduce((sum: number, p: any) => sum + p.amount, 0);
    if (participant.costAssigned > 0 && totalPaid >= participant.costAssigned) {
      participant.status = TripParticipantStatusEnum.CONFIRMED;
    }

    await trip.save();
  }

  private async removeManualPaymentFromTripParticipant(payment: PaymentEntity): Promise<void> {
    const trip = await this.tripModel.findById(payment.entityId);
    if (!trip) return;

    const participant: any = trip.participants.find(
      (p) => p.type === TripParticipantTypeEnum.PLAYER && p.player?.toString() === payment.playerId!.toString(),
    );
    if (!participant) return;

    const entry: any = participant.payments.find(
      (p: any) => p.sourcePaymentId?.toString() === (payment as any)._id.toString(),
    );
    if (entry) entry.deleteOne();

    const totalPaid = participant.payments.reduce((sum: number, p: any) => sum + p.amount, 0);
    if (participant.status === TripParticipantStatusEnum.CONFIRMED) {
      if (participant.costAssigned === 0 || totalPaid < participant.costAssigned) {
        participant.status = TripParticipantStatusEnum.PENDING;
      }
    }

    await trip.save();
  }

  private async autoConfirmTripParticipantIfNeeded(payment: PaymentEntity): Promise<void> {
    if (payment.entityType !== PaymentEntityTypeEnum.TRIP) return;

    const trip = await this.tripModel.findById(payment.entityId);
    if (!trip) return;

    const participantQuery: Record<string, unknown> = {};
    let participant: any;

    if (payment.playerId) {
      participantQuery['playerId'] = payment.playerId;
      participant = trip.participants.find(
        (p) => p.type === TripParticipantTypeEnum.PLAYER && p.player?.toString() === payment.playerId!.toString(),
      );
    } else if (payment.payerDni) {
      participantQuery['payerDni'] = payment.payerDni;
      participant = trip.participants.find(
        (p) => p.type === TripParticipantTypeEnum.EXTERNAL && p.externalDni === payment.payerDni,
      );
    }

    if (!participant) return;

    // Sync this MP payment into participant.payments[] if not already there
    const alreadySynced = participant.payments.some(
      (p: any) => p.sourcePaymentId?.toString() === (payment as any)._id.toString(),
    );
    if (!alreadySynced) {
      // Record net amount (gross minus MP fee) — gross is tracked in PaymentEntity
      const netAmount = Math.round(payment.amount * (1 - this.mpFeeRate));
      participant.payments.push({
        amount: netAmount,
        date: payment.date ?? new Date(),
        method: payment.method,
        notes: `MercadoPago${payment.mpPaymentId ? ` #${payment.mpPaymentId}` : ''}`,
        sourcePaymentId: (payment as any)._id,
      });
    }

    if (participant.costAssigned <= 0) {
      await trip.save();
      return;
    }

    const approved = await this.paymentModel
      .find({
        entityType: PaymentEntityTypeEnum.TRIP,
        entityId: payment.entityId,
        status: PaymentStatusEnum.APPROVED,
        ...participantQuery,
      })
      .select('amount')
      .lean();

    const totalPaid = approved.reduce((sum, p) => sum + p.amount, 0);
    if (totalPaid >= participant.costAssigned) {
      participant.status = TripParticipantStatusEnum.CONFIRMED;
    }

    await trip.save();
  }

  // ── Reporte global ────────────────────────────────────────────────────────

  private async buildGlobalQuery(filters: {
    status?: string;
    method?: string;
    concept?: string;
    entityType?: PaymentEntityTypeEnum;
    sport?: string;
    category?: string;
    tournamentId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<Record<string, unknown>> {
    const query: Record<string, unknown> = {};

    if (filters.status) {
      const statuses = filters.status.split(',').filter(Boolean);
      query['status'] = statuses.length === 1 ? statuses[0] : { $in: statuses };
    }
    if (filters.method) {
      const methods = filters.method.split(',').filter(Boolean);
      query['method'] = methods.length === 1 ? methods[0] : { $in: methods };
    }
    if (filters.concept) {
      const concepts = filters.concept.split(',').filter(Boolean);
      query['concept'] = concepts.length === 1 ? concepts[0] : { $in: concepts };
    }
    if (filters.entityType) query['entityType'] = filters.entityType;

    if (filters.sport || filters.category) {
      const playerQuery: Record<string, unknown> = {};
      if (filters.sport) playerQuery['sport'] = filters.sport;
      if (filters.category) playerQuery['category'] = filters.category;
      const players = await this.playerModel.find(playerQuery).select('_id').lean();
      query['playerId'] = { $in: players.map((p) => p._id) };
    }

    if (filters.tournamentId) {
      const matchIds = await this.matchModel
        .find({ tournament: new Types.ObjectId(filters.tournamentId) })
        .distinct('_id');
      query['entityType'] = PaymentEntityTypeEnum.MATCH;
      query['entityId'] = { $in: matchIds };
    }

    if (filters.dateFrom || filters.dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (filters.dateFrom) dateFilter['$gte'] = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        dateFilter['$lte'] = to;
      }
      query['date'] = dateFilter;
    }

    return query;
  }

  private async resolveEntityLabels(payments: any[]): Promise<{ matchLabelMap: Map<string, string>; tripLabelMap: Map<string, string> }> {
    const matchIds = new Set<string>();
    const tripIds = new Set<string>();
    for (const p of payments) {
      if (p.entityType === PaymentEntityTypeEnum.MATCH) matchIds.add(p.entityId.toString());
      else tripIds.add(p.entityId.toString());
    }

    const [rawMatches, rawTrips] = await Promise.all([
      matchIds.size
        ? this.matchModel.find({ _id: { $in: [...matchIds] } }).select('date opponent name tournament').populate('tournament', 'name').lean()
        : [],
      tripIds.size
        ? this.tripModel.find({ _id: { $in: [...tripIds] } }).select('name destination date').lean()
        : [],
    ]);

    const matchLabelMap = new Map<string, string>();
    for (const m of rawMatches as any[]) {
      const date = this.formatDate(m.date);
      const opponent = m.opponent ? ` vs ${m.opponent}` : '';
      const name: string = m.name || m.tournament?.name || '';
      matchLabelMap.set(m._id.toString(), name ? `${name}${opponent} (${date})` : `${opponent.trimStart() || 'Partido'} (${date})`);
    }

    const tripLabelMap = new Map<string, string>();
    for (const t of rawTrips as any[]) {
      tripLabelMap.set(t._id.toString(), t.name || t.destination || 'Viaje');
    }

    return { matchLabelMap, tripLabelMap };
  }

  private mapPaymentRow(p: any, matchLabelMap: Map<string, string>, tripLabelMap: Map<string, string>) {
    const player = p.playerId as any;
    const entityLabel =
      p.entityType === PaymentEntityTypeEnum.MATCH
        ? (matchLabelMap.get(p.entityId.toString()) ?? 'Partido')
        : p.entityType === PaymentEntityTypeEnum.TRIP
          ? (tripLabelMap.get(p.entityId.toString()) ?? 'Viaje')
          : p.concept;
    return {
      id: p._id.toString(),
      playerName: player?.name ?? '—',
      playerDni: player?.idNumber ?? '—',
      playerSport: player?.sport ?? null,
      playerCategory: player?.category ?? null,
      entityType: p.entityType as PaymentEntityTypeEnum,
      entityLabel,
      concept: p.concept,
      method: p.method as PaymentMethodEnum,
      amount: p.amount,
      status: p.status as PaymentStatusEnum,
      date: p.date,
      notes: p.notes,
    };
  }

  async getGlobalReport(filters: {
    status?: string;
    method?: string;
    concept?: string;
    entityType?: PaymentEntityTypeEnum;
    sport?: string;
    category?: string;
    tournamentId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortDir?: string;
  }) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(filters.limit ?? 50, 1000);
    const skip = (page - 1) * limit;

    const SORTABLE_FIELDS: Record<string, string> = {
      date: 'date',
      amount: 'amount',
      status: 'status',
      method: 'method',
      concept: 'concept',
    };
    const sortField = SORTABLE_FIELDS[filters.sortBy ?? ''] ?? 'date';
    const sortOrder = filters.sortDir === 'asc' ? 1 : -1;

    const query = await this.buildGlobalQuery(filters);
    const approvedQuery = { ...query, status: PaymentStatusEnum.APPROVED };

    const [total, payments, approvedAgg] = await Promise.all([
      this.paymentModel.countDocuments(query),
      this.paymentModel
        .find(query)
        .populate('playerId', 'name idNumber sport category')
        .sort({ [sortField]: sortOrder, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.paymentModel.aggregate([
        { $match: approvedQuery },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const { matchLabelMap, tripLabelMap } = await this.resolveEntityLabels(payments);
    const data = payments.map((p) => this.mapPaymentRow(p, matchLabelMap, tripLabelMap));
    const totalApproved = approvedAgg[0]?.total ?? 0;

    return { data, total, page, limit, totalApproved };
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  async getStats(sport?: string): Promise<{
    byMethod: { mp: number; cash: number };
    mpAdoptionPct: number;
    activePendingLinks: number;
    recentEvents: {
      linkId: string;
      concept: string;
      entityType: string;
      label: string;
      approved: number;
      pending: number;
      createdAt: Date;
    }[];
  }> {
    // Build entity scope filter when sport is specified
    let linkScopeFilter: Record<string, unknown> = {};
    if (sport) {
      const [matchIds, tripIds] = await Promise.all([
        this.matchModel.find({ sport }).distinct('_id'),
        this.tripModel.find({ sport }).distinct('_id'),
      ]);
      linkScopeFilter = {
        $or: [
          { entityType: PaymentEntityTypeEnum.MATCH, entityId: { $in: matchIds } },
          { entityType: PaymentEntityTypeEnum.TRIP, entityId: { $in: tripIds } },
        ],
      };
    }

    const [scopedLinkIds, recentLinks, pendingLinksCount] = await Promise.all([
      sport
        ? this.paymentLinkModel.find(linkScopeFilter).distinct('_id')
        : this.paymentLinkModel.find().distinct('_id'),
      this.paymentLinkModel
        .find(linkScopeFilter)
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      this.paymentLinkModel.countDocuments({ ...linkScopeFilter, status: PaymentLinkStatusEnum.ACTIVE }),
    ]);

    const paymentScopeFilter = sport ? { paymentLinkId: { $in: scopedLinkIds } } : {};

    const byMethodRaw = await this.paymentModel.aggregate([
      { $match: { ...paymentScopeFilter, status: PaymentStatusEnum.APPROVED } },
      { $group: { _id: '$method', count: { $sum: 1 } } },
    ]);

    const mpCount: number = byMethodRaw.find((r) => r._id === PaymentMethodEnum.MERCADOPAGO)?.count ?? 0;
    const cashCount: number = byMethodRaw.find((r) => r._id === PaymentMethodEnum.CASH)?.count ?? 0;
    const total = mpCount + cashCount;
    const mpAdoptionPct = total > 0 ? Math.round((mpCount / total) * 100) : 0;

    // For each recent link, count approved and pending payments
    const linkIds = recentLinks.map((l) => l._id);
    const paymentCounts = await this.paymentModel.aggregate([
      { $match: { paymentLinkId: { $in: linkIds }, status: { $in: [PaymentStatusEnum.APPROVED, PaymentStatusEnum.PENDING] } } },
      { $group: { _id: { linkId: '$paymentLinkId', status: '$status' }, count: { $sum: 1 } } },
    ]);

    const countMap: Record<string, { approved: number; pending: number }> = {};
    for (const r of paymentCounts) {
      const key = r._id.linkId.toString();
      if (!countMap[key]) countMap[key] = { approved: 0, pending: 0 };
      if (r._id.status === PaymentStatusEnum.APPROVED) countMap[key].approved = r.count;
      if (r._id.status === PaymentStatusEnum.PENDING) countMap[key].pending = r.count;
    }

    const recentEvents = await Promise.all(
      recentLinks.map(async (link) => {
        const label = await this.resolveEntityLabel(link.entityType, link.entityId.toString(), link.entityIds);
        const counts = countMap[link._id.toString()] ?? { approved: 0, pending: 0 };
        return {
          linkId: link._id.toString(),
          concept: link.concept,
          entityType: link.entityType,
          label,
          approved: counts.approved,
          pending: counts.pending,
          createdAt: link.createdAt,
        };
      })
    );

    return {
      byMethod: { mp: mpCount, cash: cashCount },
      mpAdoptionPct,
      activePendingLinks: pendingLinksCount,
      recentEvents,
    };
  }

  // ── Reporte PDF ───────────────────────────────────────────────────────────

  async generatePdfReport(
    entityType: PaymentEntityTypeEnum,
    entityId: string
  ): Promise<Buffer> {
    const [payments, entityLabel] = await Promise.all([
      this.paymentModel
        .find({ entityType, entityId: new Types.ObjectId(entityId) })
        .populate({ path: 'playerId', select: 'name idNumber' })
        .sort({ date: 1 })
        .lean(),
      this.resolveEntityLabel(entityType, entityId),
    ]);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 40, size: 'A4' });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Encabezado
      doc.fontSize(16).text('Los Tordos RC — Reporte de Cobros', { align: 'center' });
      doc.fontSize(12).text(entityLabel, { align: 'center' });
      doc.moveDown();

      // Totales
      const approved = payments.filter((p) => p.status === PaymentStatusEnum.APPROVED);
      const totalApproved = approved.reduce((s, p) => s + p.amount, 0);
      const pending = payments.filter((p) => p.status === PaymentStatusEnum.PENDING);
      const totalPending = pending.reduce((s, p) => s + p.amount, 0);

      doc
        .fontSize(10)
        .text(`Total aprobado: ${this.formatMoney(totalApproved)}   |   Pendiente: ${this.formatMoney(totalPending)}   |   Total pagos: ${payments.length}`)
        .moveDown();

      // Tabla
      const cols = [30, 160, 60, 80, 80, 70, 90, 100];
      const headers = ['#', 'Jugador', 'DNI', 'Concepto', 'Método', 'Monto', 'Fecha', 'Estado'];
      const startX = 40;
      let y = doc.y;

      // Cabecera de tabla
      doc.fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(h, startX + cols.slice(0, i).reduce((a, b) => a + b, 0), y, {
          width: cols[i],
          align: 'left',
        });
      });
      y += 14;
      doc.moveTo(startX, y).lineTo(startX + cols.reduce((a, b) => a + b, 0), y).stroke();
      y += 4;

      // Filas
      doc.font('Helvetica');
      payments.forEach((p, idx) => {
        const player = p.playerId as any;
        const row = [
          String(idx + 1),
          player?.name ?? '-',
          player?.idNumber ?? '-',
          p.concept,
          p.method,
          this.formatMoney(p.amount),
          this.formatDate(p.date),
          p.status,
        ];

        if (y > 750) {
          doc.addPage();
          y = 40;
        }

        row.forEach((cell, i) => {
          doc.fontSize(8).text(cell, startX + cols.slice(0, i).reduce((a, b) => a + b, 0), y, {
            width: cols[i],
            align: 'left',
          });
        });
        y += 14;
      });

      doc.end();
    });
  }

  async getEncounterReport(matchIds: string[]): Promise<{
    encounterLabel: string;
    date: string;
    time?: string;
    opponent?: string;
    categories: {
      matchId: string;
      category: string;
      categoryLabel: string;
      count: number;
      total: number;
      payments: { playerName: string; playerDni: string; concept: string; method: string; amount: number; date: string }[];
    }[];
    grandTotal: number;
    grandCount: number;
  }> {
    const objectIds = matchIds.map((id) => new Types.ObjectId(id));
    const [matches, payments] = await Promise.all([
      this.matchModel
        .find({ _id: { $in: objectIds } })
        .select('category name date time opponent tournament')
        .populate('tournament', 'name')
        .lean(),
      this.paymentModel
        .find({ entityType: PaymentEntityTypeEnum.MATCH, entityId: { $in: objectIds }, status: PaymentStatusEnum.APPROVED })
        .populate({ path: 'playerId', select: 'name idNumber' })
        .sort({ entityId: 1, date: 1 })
        .lean(),
    ]);

    const first = matches[0] as any;
    const encounterLabel = first?.name || (first?.tournament as any)?.name
      || (first?.opponent ? `vs ${first.opponent}` : 'Encuentro');
    const date = first ? this.formatDate(first.date) : '';
    const time: string | undefined = first?.time || undefined;
    const opponent: string | undefined = first?.opponent || undefined;

    const categoryMap = new Map<string, {
      matchId: string;
      count: number;
      total: number;
      payments: { playerName: string; playerDni: string; concept: string; method: string; amount: number; date: string }[];
    }>();
    for (const match of matches) {
      const cat = match.category || 'sin_categoria';
      if (!categoryMap.has(cat)) categoryMap.set(cat, { matchId: (match as any)._id.toString(), count: 0, total: 0, payments: [] });
    }
    for (const p of payments) {
      const match = matches.find((m) => (m as any)._id.equals(p.entityId));
      const cat = match?.category || 'sin_categoria';
      const entry = categoryMap.get(cat) ?? { matchId: (match as any)?._id?.toString() ?? '', count: 0, total: 0, payments: [] };
      const player = p.playerId as any;
      entry.count++;
      entry.total += p.amount;
      entry.payments.push({
        playerName: player?.name ?? '-',
        playerDni: player?.idNumber ?? '-',
        concept: p.concept,
        method: p.method,
        amount: p.amount,
        date: this.formatDate(p.date),
      });
      categoryMap.set(cat, entry);
    }

    const categoryOrder = this.CATEGORY_ORDER;
    const categories = Array.from(categoryMap.entries())
      .sort(([a], [b]) => {
        const ia = categoryOrder.indexOf(a);
        const ib = categoryOrder.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      })
      .map(([category, data]) => ({
        matchId: data.matchId,
        category,
        categoryLabel: getCategoryLabel(category as CategoryEnum),
        count: data.count,
        total: data.total,
        payments: data.payments,
      }));

    const grandTotal = categories.reduce((s, c) => s + c.total, 0);
    const grandCount = categories.reduce((s, c) => s + c.count, 0);
    return { encounterLabel, date, time, opponent, categories, grandTotal, grandCount };
  }

  async generateEncounterPdfReport(matchIds: string[]): Promise<Buffer> {
    const objectIds = matchIds.map((id) => new Types.ObjectId(id));
    const [matches, payments] = await Promise.all([
      this.matchModel
        .find({ _id: { $in: objectIds } })
        .select('category name date time opponent tournament')
        .populate('tournament', 'name')
        .lean(),
      this.paymentModel
        .find({ entityType: PaymentEntityTypeEnum.MATCH, entityId: { $in: objectIds }, status: PaymentStatusEnum.APPROVED })
        .populate({ path: 'playerId', select: 'name idNumber' })
        .sort({ entityId: 1, date: 1 })
        .lean(),
    ]);

    const first = matches[0] as any;
    const encounterLabel = first?.name || (first?.tournament as any)?.name
      || (first?.opponent ? `vs ${first.opponent}` : 'Encuentro');
    const dateLabel = first ? this.formatDate(first.date) : '';
    const timeLabel = first?.time ? ` · ${first.time}hs` : '';
    const opponentLabel = first?.opponent ? ` vs ${first.opponent}` : '';

    const categoryOrder = this.CATEGORY_ORDER;
    const categoryGroups = new Map<string, typeof payments>();
    for (const match of matches) {
      const cat = match.category || 'sin_categoria';
      if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
    }
    for (const p of payments) {
      const match = matches.find((m) => (m as any)._id.equals(p.entityId));
      const cat = match?.category || 'sin_categoria';
      const group = categoryGroups.get(cat) ?? [];
      group.push(p);
      categoryGroups.set(cat, group);
    }
    const sortedCategories = Array.from(categoryGroups.keys()).sort((a, b) => {
      const ia = categoryOrder.indexOf(a);
      const ib = categoryOrder.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const startX = 40;
      const pageWidth = 515;

      doc.fontSize(16).text('Los Tordos RC — Informe de Encuentro', { align: 'center' });
      doc.fontSize(12).text(`${encounterLabel}${opponentLabel}`, { align: 'center' });
      doc.fontSize(10).text(`${dateLabel}${timeLabel}`, { align: 'center' }).moveDown();

      const grandTotal = payments.reduce((s, p) => s + p.amount, 0);
      doc.fontSize(10).text(`Total cobrado: ${this.formatMoney(grandTotal)}   |   Total pagos: ${payments.length}`, { align: 'center' }).moveDown();

      const cols = [140, 60, 90, 80, 80, 65];
      const headers = ['Jugador', 'DNI', 'Concepto', 'Método', 'Monto', 'Fecha'];

      let y = doc.y;

      for (const cat of sortedCategories) {
        const group = categoryGroups.get(cat) ?? [];
        const catTotal = group.reduce((s, p) => s + p.amount, 0);
        const catLabel = getCategoryLabel(cat as CategoryEnum);

        if (y > 700) { doc.addPage(); y = 40; }

        // Encabezado de categoría
        doc.fontSize(11).font('Helvetica-Bold')
          .fillColor('#1976d2')
          .text(`${catLabel}   —   ${group.length} pago(s)   ${this.formatMoney(catTotal)}`, startX, y);
        y += 16;
        doc.fillColor('black');

        if (group.length === 0) {
          doc.fontSize(8).font('Helvetica').fillColor('#888').text('Sin pagos registrados', startX + 10, y);
          y += 14;
          doc.fillColor('black');
          continue;
        }

        // Cabecera de tabla
        doc.fontSize(8).font('Helvetica-Bold');
        headers.forEach((h, i) => {
          doc.text(h, startX + cols.slice(0, i).reduce((a, b) => a + b, 0), y, { width: cols[i], align: 'left' });
        });
        y += 12;
        doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
        y += 3;

        // Filas
        doc.font('Helvetica');
        group.forEach((p) => {
          if (y > 750) { doc.addPage(); y = 40; }
          const player = p.playerId as any;
          const row = [
            player?.name ?? '-',
            player?.idNumber ?? '-',
            p.concept,
            p.method,
            this.formatMoney(p.amount),
            this.formatDate(p.date),
          ];
          row.forEach((cell, i) => {
            doc.fontSize(8).text(cell, startX + cols.slice(0, i).reduce((a, b) => a + b, 0), y, { width: cols[i], align: 'left' });
          });
          y += 13;
        });

        // Subtotal
        y += 2;
        doc.fontSize(8).font('Helvetica-Bold').text(`Subtotal ${catLabel}: ${this.formatMoney(catTotal)}`, startX, y, { align: 'right', width: pageWidth });
        y += 16;
        doc.font('Helvetica');
      }

      doc.end();
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private assertLinkActive(link: { status: PaymentLinkStatusEnum; expiresAt: Date }) {
    if (link.status === PaymentLinkStatusEnum.CANCELLED) {
      throw new GoneException('Este link de pago fue cancelado');
    }
    if (link.status === PaymentLinkStatusEnum.EXPIRED || new Date() > link.expiresAt) {
      throw new GoneException('Este link de pago ha expirado');
    }
  }


  private mapMpStatus(mpStatus: string): PaymentStatusEnum {
    switch (mpStatus) {
      case 'approved':
        return PaymentStatusEnum.APPROVED;
      case 'in_process':
      case 'authorized':
        return PaymentStatusEnum.IN_PROCESS;
      case 'rejected':
        return PaymentStatusEnum.REJECTED;
      case 'cancelled':
        return PaymentStatusEnum.CANCELLED;
      default:
        return PaymentStatusEnum.PENDING;
    }
  }

  validateMpWebhookSignature(
    signature: string | undefined,
    requestId: string | undefined,
    dataId: string,
    ts: string,
  ): boolean {
    if (!this.mpWebhookSecret) return true; // si no está configurado, se omite la validación
    if (!signature || !requestId) return false;

    const v1Match = signature.match(/v1=([a-f0-9]+)/);
    if (!v1Match) return false;
    const receivedHash = v1Match[1];

    const template = `id:${dataId};request-id:${requestId};ts:${ts}`;
    const expectedHash = require('crypto')
      .createHmac('sha256', this.mpWebhookSecret)
      .update(template)
      .digest('hex');

    return receivedHash === expectedHash;
  }

  private formatMoney(amount: number): string {
    return '$' + amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private formatDate(date: Date | string): string {
    const d = new Date(date);
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
  }

  private formatTime(date: Date | string): string | undefined {
    const d = new Date(date);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    if (h === 0 && m === 0) return undefined;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private readonly CATEGORY_ORDER = [
    'm5','m6','m7','m8','m9','m10','m11','m12','m13','m14','m15','m16','m17','m19',
    'pre_decima','decima','novena','octava','septima','sexta','quinta','cuarta','master','plantel_superior',
  ];

  private async resolveMatchInfo(
    entityType: PaymentEntityTypeEnum,
    entityId: string,
    entityIds?: Types.ObjectId[]
  ): Promise<{ date: string; time?: string; opponents?: string; categories: string[]; tournamentName?: string } | null> {
    if (entityType !== PaymentEntityTypeEnum.MATCH) return null;

    if (entityIds && entityIds.length > 1) {
      const matches = await this.matchModel
        .find({ _id: { $in: entityIds } })
        .select('date time opponent category name tournament')
        .populate('tournament', 'name')
        .lean();
      if (!matches.length) return null;
      const first = matches[0] as any;
      const date = this.formatDate(first.date);
      const time: string | undefined = first.time || undefined;
      const categories = matches
        .map((m) => m.category)
        .filter(Boolean) as string[];
      categories.sort(
        (a, b) => this.CATEGORY_ORDER.indexOf(a) - this.CATEGORY_ORDER.indexOf(b)
      );
      const tournamentName: string | undefined =
        first.name || first.tournament?.name || undefined;
      return { date, time, opponents: first.opponent || undefined, categories, tournamentName };
    }

    const match = await this.matchModel
      .findById(entityId)
      .select('date time opponent name category tournament')
      .populate('tournament', 'name')
      .lean() as any;
    if (!match) return null;
    const date = this.formatDate(match.date);
    const time: string | undefined = match.time || undefined;
    const tournamentName: string | undefined =
      match.name || match.tournament?.name || undefined;
    return {
      date,
      time,
      opponents: match.opponent || undefined,
      categories: match.category ? [match.category] : [],
      tournamentName,
    };
  }

  private async resolveEntityLabel(
    entityType: PaymentEntityTypeEnum,
    entityId: string,
    entityIds?: Types.ObjectId[]
  ): Promise<string> {
    if (entityType === PaymentEntityTypeEnum.MATCH) {
      if (entityIds && entityIds.length > 1) {
        const matches = await this.matchModel
          .find({ _id: { $in: entityIds } })
          .select('date opponent name category tournament')
          .populate('tournament', 'name')
          .sort({ category: 1 })
          .lean();
        if (!matches.length) return 'Encuentro';
        const first = matches[0] as any;
        const date = this.formatDate(first.date);
        const categories = matches.map((m) => m.category).join(', ');
        const opponent = first.opponent ? ` vs ${first.opponent}` : '';
        const tournamentName: string = first.name || first.tournament?.name || '';
        return tournamentName
          ? `${tournamentName}${opponent} (${date})`
          : `${categories}${opponent} (${date})`;
      }
      const match = await this.matchModel
        .findById(entityId)
        .select('date opponent name category')
        .lean();
      if (!match) return 'Partido';
      const date = this.formatDate(match.date);
      const opponent = match.opponent ? ` vs ${match.opponent}` : '';
      const catLabel = match.category ? `${getCategoryLabel(match.category as CategoryEnum)} ` : '';
      return match.name
        ? `${match.name}${opponent} (${date})`
        : `${catLabel}${opponent.trimStart()} (${date})`;
    }
    if (entityType === PaymentEntityTypeEnum.TRIP) {
      const trip = await this.tripModel
        .findById(entityId)
        .select('name destination departureDate')
        .lean();
      if (!trip) return 'Viaje';
      const date = this.formatDate(trip.departureDate);
      return `${trip.name} — ${trip.destination} (${date})`;
    }
    return entityId;
  }
}
