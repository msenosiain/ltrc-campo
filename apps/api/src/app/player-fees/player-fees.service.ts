import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import MercadoPagoConfig, { Payment as MpPayment, Preference } from 'mercadopago';
import { PlayerFeeConfigEntity } from './schemas/player-fee-config.entity';
import { FamilyGroupEntity } from './schemas/family-group.entity';
import { PlayerFeePaymentEntity } from './schemas/player-fee-payment.entity';
import { PlayerSeasonRecordEntity } from './schemas/player-season-record.entity';
import { PlayerEntity } from '../players/schemas/player.entity';
import { PaymentEntity } from '../payments/schemas/payment.entity';
import { CreatePlayerFeeConfigDto } from './dto/create-player-fee-config.dto';
import { UpdatePlayerFeeConfigDto } from './dto/update-player-fee-config.dto';
import { CreateFamilyGroupDto } from './dto/create-family-group.dto';
import { UpdateSeasonRecordDto } from './dto/update-season-record.dto';
import { RecordManualFeePaymentDto } from './dto/record-manual-fee-payment.dto';
import { BduarImportDto } from './dto/bduar-import.dto';
import { ConfirmPlayerFeeDto } from './dto/validate-player-fee.dto';
import {
  BloodTypeEnum,
  CategoryEnum,
  PlayerFeeStatusEnum,
  PlayerStatusEnum,
  RugbyPositions,
  SportEnum,
  IPlayerFeeStatusRow,
  PaymentEntityTypeEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
} from '@ltrc-campo/shared-api-model';

// Rugby categories M15 → PS: requieren cursos obligatorios y fondo solidario
const RUGBY_M15_PLUS = new Set<CategoryEnum>([
  CategoryEnum.M15,
  CategoryEnum.M16,
  CategoryEnum.M17,
  CategoryEnum.M19,
  CategoryEnum.PLANTEL_SUPERIOR,
]);

// Orden lógico de categorías para mostrar en listas (mayor → menor)
const CATEGORY_ORDER: CategoryEnum[] = [
  CategoryEnum.PLANTEL_SUPERIOR,
  CategoryEnum.M19,
  CategoryEnum.M17,
  CategoryEnum.M16,
  CategoryEnum.M15,
  CategoryEnum.M14,
  CategoryEnum.M13,
  CategoryEnum.M12,
  CategoryEnum.M11,
  CategoryEnum.M10,
  CategoryEnum.M9,
  CategoryEnum.M8,
  CategoryEnum.M7,
  CategoryEnum.M6,
  CategoryEnum.M5,
  // Hockey
  CategoryEnum.CUARTA,
  CategoryEnum.QUINTA,
  CategoryEnum.SEXTA,
  CategoryEnum.SEPTIMA,
  CategoryEnum.OCTAVA,
  CategoryEnum.NOVENA,
  CategoryEnum.DECIMA,
  CategoryEnum.PRE_DECIMA,
  CategoryEnum.MASTER,
];

const categoryIndex = (cat: string) => {
  const i = CATEGORY_ORDER.indexOf(cat as CategoryEnum);
  return i === -1 ? 999 : i;
};

@Injectable()
export class PlayerFeesService {
  private readonly mpFeeRate: number;
  private readonly mpClient: MercadoPagoConfig;
  private readonly appBaseUrl: string;

  constructor(
    @InjectModel(PlayerFeeConfigEntity.name)
    private readonly configModel: Model<PlayerFeeConfigEntity>,
    @InjectModel(FamilyGroupEntity.name)
    private readonly familyGroupModel: Model<FamilyGroupEntity>,
    @InjectModel(PlayerFeePaymentEntity.name)
    private readonly paymentModel: Model<PlayerFeePaymentEntity>,
    @InjectModel(PlayerSeasonRecordEntity.name)
    private readonly seasonRecordModel: Model<PlayerSeasonRecordEntity>,
    @InjectModel(PlayerEntity.name)
    private readonly playerModel: Model<PlayerEntity>,
    @InjectModel(PaymentEntity.name)
    private readonly generalPaymentModel: Model<PaymentEntity>,
    private readonly configService: ConfigService,
  ) {
    const rawRate = parseFloat(
      this.configService.get<string>('MP_FEE_RATE') ?? '0.05'
    );
    // Si viene como porcentaje (ej: 5) en lugar de decimal (0.05), convertir
    this.mpFeeRate = rawRate > 1 ? rawRate / 100 : rawRate;
    this.mpClient = new MercadoPagoConfig({
      accessToken: this.configService.get<string>('MP_ACCESS_TOKEN', ''),
    });
    this.appBaseUrl = this.configService.get<string>('APP_BASE_URL', 'http://localhost:4200');
  }

  // ── Config ────────────────────────────────────────────────────────────────

  private mapConfig(doc: any) {
    return {
      id: doc._id?.toString() ?? doc.id,
      season: doc.season,
      sport: doc.sport,
      feeType: doc.feeType,
      label: doc.label,
      description: doc.description,
      addMpFee: doc.addMpFee,
      mpFeeRate: doc.mpFeeRate,
      active: doc.active,
      linkToken: doc.linkToken,
      familyDiscount: doc.familyDiscount,
      blocks: doc.blocks ?? [],
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async listConfigs() {
    const docs = await this.configModel.find().sort({ season: -1, sport: 1 }).lean();
    return docs.map(d => this.mapConfig(d));
  }

  async createConfig(dto: CreatePlayerFeeConfigDto, userId: string) {
    const linkToken = uuidv4();
    const config = await this.configModel.create({
      season: dto.season,
      sport: dto.sport,
      feeType: dto.feeType,
      label: dto.label,
      description: dto.description,
      addMpFee: dto.addMpFee,
      familyDiscount: dto.familyDiscount,
      blocks: dto.blocks.map((b) => ({
        name: b.name,
        categories: b.categories,
        amount: b.amount,
        ...(b.expiresAt ? { expiresAt: new Date(b.expiresAt) } : {}),
      })),
      linkToken,
      mpFeeRate: this.mpFeeRate,
      active: false,
      createdBy: new Types.ObjectId(userId),
    });
    return this.mapConfig(config.toObject());
  }

  async updateConfig(id: string, dto: UpdatePlayerFeeConfigDto) {
    const update: Record<string, unknown> = {};
    if (dto.season !== undefined) update['season'] = dto.season;
    if (dto.sport !== undefined) update['sport'] = dto.sport;
    if (dto.feeType !== undefined) update['feeType'] = dto.feeType;
    if (dto.label !== undefined) update['label'] = dto.label;
    if (dto.description !== undefined) update['description'] = dto.description;
    if (dto.addMpFee !== undefined) update['addMpFee'] = dto.addMpFee;
    if (dto.familyDiscount !== undefined) update['familyDiscount'] = dto.familyDiscount;
    if (dto.blocks !== undefined) {
      update['blocks'] = dto.blocks.map((b) => ({
        name: b.name,
        categories: b.categories,
        amount: b.amount,
        ...(b.expiresAt ? { expiresAt: new Date(b.expiresAt) } : {}),
      }));
    }
    const config = await this.configModel.findByIdAndUpdate(id, update, { new: true });
    if (!config) throw new NotFoundException('Configuración no encontrada');
    return this.mapConfig(config.toObject());
  }

  async activateConfig(id: string) {
    const config = await this.configModel.findById(id);
    if (!config) throw new NotFoundException('Configuración no encontrada');
    config.active = true;
    await config.save();
    return this.mapConfig(config.toObject());
  }

  async deactivateConfig(id: string) {
    const config = await this.configModel.findById(id);
    if (!config) throw new NotFoundException('Configuración no encontrada');
    config.active = false;
    await config.save();
    return this.mapConfig(config.toObject());
  }

  async deleteConfig(id: string) {
    const hasPayments = await this.paymentModel.exists({ configId: new Types.ObjectId(id) });
    if (hasPayments) {
      throw new ConflictException('No se puede eliminar una configuración con pagos registrados');
    }
    const config = await this.configModel.findByIdAndDelete(id);
    if (!config) throw new NotFoundException('Configuración no encontrada');
    return { deleted: true };
  }

  // ── Family groups ─────────────────────────────────────────────────────────

  async listFamilyGroups() {
    const groups = await this.familyGroupModel
      .find()
      .populate({ path: 'members.playerId', select: 'name idNumber' })
      .sort({ name: 1 })
      .lean<any[]>();
    return groups.map((g: any) => this.mapFamilyGroup(g));
  }

  private mapFamilyGroup(g: any) {
    return {
      id: g._id?.toString() ?? g.id,
      name: g.name,
      sport: g.sport,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      members: (g.members ?? []).map((m: any) => ({
        playerId: m.playerId?._id?.toString() ?? m.playerId?.toString(),
        playerName: m.playerId?.name ?? null,
        playerDni: m.playerId?.idNumber ?? null,
        order: m.order,
      })),
    };
  }

  async createFamilyGroup(dto: CreateFamilyGroupDto, userId: string) {
    const members = dto.members.map((m) => ({
      playerId: new Types.ObjectId(m.playerId),
      order: m.order,
    }));
    const group = await this.familyGroupModel.create({
      name: dto.name,
      sport: dto.sport,
      members,
      createdBy: new Types.ObjectId(userId),
    });
    return this.mapFamilyGroup(group.toObject());
  }

  async updateFamilyGroup(id: string, dto: CreateFamilyGroupDto) {
    const members = dto.members.map((m) => ({
      playerId: new Types.ObjectId(m.playerId),
      order: m.order,
    }));
    const group = await this.familyGroupModel.findByIdAndUpdate(
      id,
      { name: dto.name, sport: dto.sport, members },
      { new: true }
    );
    if (!group) throw new NotFoundException('Grupo familiar no encontrado');
    return this.mapFamilyGroup(group.toObject());
  }

  async deleteFamilyGroup(id: string) {
    const group = await this.familyGroupModel.findByIdAndDelete(id);
    if (!group) throw new NotFoundException('Grupo familiar no encontrado');
    return { deleted: true };
  }

  async importFamilyGroups(
    groups: { name: string; dnis: string[] }[],
    userId: string,
  ): Promise<{ total: number; created: number; skipped: number; notFound: string[] }> {
    let created = 0;
    let skipped = 0;
    const notFound: string[] = [];

    for (const group of groups) {
      const members: { playerId: Types.ObjectId; order: 1 | 2 | 3 }[] = [];
      let order = 1;

      for (const dni of group.dnis) {
        const player = await this.playerModel
          .findOne({ idNumber: dni, sport: SportEnum.RUGBY })
          .select('_id')
          .lean();
        if (player) {
          members.push({ playerId: (player as any)._id, order: Math.min(order++, 3) as 1 | 2 | 3 });
        } else {
          notFound.push(dni);
        }
      }

      if (members.length < 2) {
        skipped++;
        continue;
      }

      const existing = await this.familyGroupModel.findOne({ name: group.name });
      if (existing) {
        skipped++;
        continue;
      }

      await this.familyGroupModel.create({
        name: group.name,
        sport: SportEnum.RUGBY,
        members,
        createdBy: new Types.ObjectId(userId),
      });
      created++;
    }

    return { total: groups.length, created, skipped, notFound };
  }

  // ── Season records ────────────────────────────────────────────────────────

  async updateSeasonRecord(playerId: string, dto: UpdateSeasonRecordDto, userId: string) {
    const update: Record<string, unknown> = {
      updatedBy: new Types.ObjectId(userId),
    };
    if (dto.membershipCurrent !== undefined) update['membershipCurrent'] = dto.membershipCurrent;
    if (dto.bduarRegistered !== undefined) update['bduarRegistered'] = dto.bduarRegistered;
    if (dto.bduarRegistrationDate) update['bduarRegistrationDate'] = new Date(dto.bduarRegistrationDate);
    if (dto.coursesApproved !== undefined) update['coursesApproved'] = dto.coursesApproved;
    if (dto.coursesDate) update['coursesDate'] = new Date(dto.coursesDate);
    if (dto.solidarityFundPaid !== undefined) update['solidarityFundPaid'] = dto.solidarityFundPaid;
    if (dto.solidarityFundDate) update['solidarityFundDate'] = new Date(dto.solidarityFundDate);
    if (dto.notes !== undefined) update['notes'] = dto.notes;

    return this.seasonRecordModel.findOneAndUpdate(
      { playerId: new Types.ObjectId(playerId), season: dto.season, sport: dto.sport },
      { $set: update },
      { upsert: true, new: true }
    );
  }

  async getSeasonRecord(playerId: string, season: string, sport: SportEnum) {
    return this.seasonRecordModel.findOne({
      playerId: new Types.ObjectId(playerId),
      season,
      sport,
    });
  }

  // ── Manual payment ───────────────────────────────────────────────────────

  async previewManualPayment(playerId: string, season: string, sport: SportEnum) {
    const player = await this.playerModel.findById(playerId).select('category').lean();
    if (!player) throw new NotFoundException('Jugador no encontrado');

    const config = await this.configModel.findOne({ season, sport, active: true }).lean();
    if (!config) return { originalAmount: null, discountPct: null, discountReason: null, finalAmount: null };

    const resolved = this.resolveAmountForCategory(config as any, player.category as CategoryEnum);
    if (!resolved) return { originalAmount: null, discountPct: null, discountReason: null, finalAmount: null };

    const discount = config.familyDiscount
      ? await this.resolveFamilyDiscount(config as any, playerId, sport)
      : null;

    const originalAmount = resolved.amount;
    const discountPct = discount?.discountPct ?? 0;
    const finalAmount = discountPct
      ? Math.round(originalAmount * (1 - discountPct / 100))
      : originalAmount;

    return {
      originalAmount,
      discountPct: discountPct || null,
      discountReason: discount?.discountReason ?? null,
      finalAmount,
    };
  }

  async recordManualPayment(dto: RecordManualFeePaymentDto): Promise<void> {
    const existing = await this.paymentModel.findOne({
      playerId: new Types.ObjectId(dto.playerId),
      season: dto.season,
      sport: dto.sport,
      status: PlayerFeeStatusEnum.APPROVED,
    });
    if (existing) throw new ConflictException('El jugador ya tiene el derecho pagado para esta temporada');

    const player = await this.playerModel.findById(dto.playerId).select('category').lean();
    if (!player) throw new NotFoundException('Jugador no encontrado');

    const config = await this.configModel.findOne({ season: dto.season, sport: dto.sport, active: true }).lean();

    let originalAmount = 0;
    let discountPct = 0;
    let discountReason: string | undefined;
    let finalAmount = 0;

    if (config) {
      const resolved = this.resolveAmountForCategory(config as any, player.category as CategoryEnum);
      if (resolved) {
        originalAmount = resolved.amount;
        const discount = config.familyDiscount
          ? await this.resolveFamilyDiscount(config as any, dto.playerId, dto.sport)
          : null;
        discountPct = discount?.discountPct ?? 0;
        discountReason = discount?.discountReason;
        finalAmount = discountPct
          ? Math.round(originalAmount * (1 - discountPct / 100))
          : originalAmount;
      }
    }

    const paidAt = new Date();
    const feePayment = await this.paymentModel.create({
      playerId: new Types.ObjectId(dto.playerId),
      ...(config ? { configId: (config as any)._id } : {}),
      season: dto.season,
      sport: dto.sport,
      originalAmount,
      discountPct: discountPct || undefined,
      discountReason,
      finalAmount,
      status: PlayerFeeStatusEnum.APPROVED,
      paymentMethod: dto.method,
      paidAt,
    });
    await this.createPaymentRecord(feePayment, config, dto.method, finalAmount, paidAt);
  }

  // ── Status list ───────────────────────────────────────────────────────────

  async getStatus(season: string, sport: SportEnum, category?: string, categories?: CategoryEnum[]): Promise<IPlayerFeeStatusRow[]> {
    const playerQuery: Record<string, unknown> = { sport, status: 'active' };
    if (categories?.length) playerQuery['category'] = { $in: categories };
    else if (category) playerQuery['category'] = category;

    const [players, configs] = await Promise.all([
      this.playerModel
        .find(playerQuery)
        .select('name idNumber category')
        .sort({ name: 1 })
        .lean(),
      this.configModel
        .find({ season, sport, active: true })
        .lean(),
    ]);

    if (!players.length) return [];

    const playerIds = players.map((p) => (p as any)._id);

    const [payments, records] = await Promise.all([
      this.paymentModel
        .find({
          playerId: { $in: playerIds },
          season,
          sport,
          status: PlayerFeeStatusEnum.APPROVED,
        })
        .lean(),
      this.seasonRecordModel
        .find({ playerId: { $in: playerIds }, season, sport })
        .lean(),
    ]);

    const paymentMap = new Map(payments.map((p) => [p.playerId.toString(), p]));
    const recordMap = new Map(records.map((r) => [r.playerId.toString(), r]));

    return players.map((player) => {
      const pid = (player as any)._id.toString();
      const payment = paymentMap.get(pid);
      const record = recordMap.get(pid);
      const cat = player.category as CategoryEnum;
      const needsFondoSolidario = sport === SportEnum.RUGBY && RUGBY_M15_PLUS.has(cat);

      const needsCursos = sport === SportEnum.RUGBY && RUGBY_M15_PLUS.has(cat);

      const feePaid = !!payment;
      const membershipCurrent = record?.membershipCurrent ?? false;
      const bduarRegistered = record?.bduarRegistered ?? false;
      const coursesApproved = needsCursos ? (record?.coursesApproved ?? false) : undefined;
      const solidarityFundPaid = needsFondoSolidario
        ? (record?.solidarityFundPaid ?? false)
        : undefined;

      const eligible =
        membershipCurrent &&
        feePaid &&
        bduarRegistered &&
        (!needsCursos || coursesApproved === true) &&
        (!needsFondoSolidario || solidarityFundPaid === true);

      return {
        playerId: pid,
        playerName: player.name,
        playerDni: player.idNumber ?? '',
        category: cat,
        feePaid,
        feeAmount: payment?.finalAmount,
        feePaidAt: payment?.paidAt,
        membershipCurrent,
        bduarRegistered,
        coursesApproved,
        solidarityFundPaid,
        eligible,
      };
    }).sort((a, b) => {
      const catDiff = categoryIndex(a.category) - categoryIndex(b.category);
      return catDiff !== 0 ? catDiff : (a.playerName ?? '').localeCompare(b.playerName ?? '', 'es');
    });
  }

  async getPlayerStatus(playerId: string, season: string): Promise<IPlayerFeeStatusRow[]> {
    const player = await this.playerModel
      .findById(playerId)
      .select('name idNumber category sport')
      .lean();
    if (!player) return [];

    const sport = (player as any).sport as SportEnum;
    const cat = (player as any).category as CategoryEnum;
    const pid = (player as any)._id.toString();
    const needsFondoSolidario = sport === SportEnum.RUGBY && RUGBY_M15_PLUS.has(cat);

    const [payment, record] = await Promise.all([
      this.paymentModel.findOne({ playerId: (player as any)._id, season, sport, status: PlayerFeeStatusEnum.APPROVED }).lean(),
      this.seasonRecordModel.findOne({ playerId: (player as any)._id, season, sport }).lean(),
    ]);

    const needsCursos = sport === SportEnum.RUGBY && RUGBY_M15_PLUS.has(cat);

    const feePaid = !!payment;
    const membershipCurrent = record?.membershipCurrent ?? false;
    const bduarRegistered = record?.bduarRegistered ?? false;
    const coursesApproved = needsCursos ? (record?.coursesApproved ?? false) : undefined;
    const solidarityFundPaid = needsFondoSolidario ? (record?.solidarityFundPaid ?? false) : undefined;
    const eligible =
      membershipCurrent &&
      feePaid &&
      bduarRegistered &&
      (!needsCursos || coursesApproved === true) &&
      (!needsFondoSolidario || solidarityFundPaid === true);

    return [{
      playerId: pid,
      playerName: (player as any).name,
      playerDni: (player as any).idNumber ?? '',
      category: cat,
      feePaid,
      feeAmount: (payment as any)?.finalAmount,
      feePaidAt: (payment as any)?.paidAt,
      membershipCurrent,
      bduarRegistered,
      coursesApproved,
      solidarityFundPaid,
      eligible,
    }];
  }

  async getStats(season: string, sport: SportEnum) {
    const rows = await this.getStatus(season, sport);
    const byCategory = new Map<string, { total: number; eligible: number; paid: number }>();

    for (const row of rows) {
      const cat = row.category;
      if (!byCategory.has(cat)) byCategory.set(cat, { total: 0, eligible: 0, paid: 0 });
      const entry = byCategory.get(cat)!;
      entry.total++;
      if (row.feePaid) entry.paid++;
      if (row.eligible) entry.eligible++;
    }

    return {
      total: rows.length,
      paid: rows.filter((r) => r.feePaid).length,
      eligible: rows.filter((r) => r.eligible).length,
      byCategory: Object.fromEntries(byCategory),
    };
  }

  // ── Public payment flow ───────────────────────────────────────────────────

  async getPublicInfo(token: string) {
    const config = await this.getConfigByToken(token);
    return {
      linkToken: config.linkToken,
      label: config.label,
      description: config.description,
      season: config.season,
      sport: config.sport,
    };
  }

  async validatePlayerFee(token: string, dni: string) {
    const config = await this.getConfigByToken(token);

    const player = await this.playerModel
      .findOne({ idNumber: dni.trim() })
      .select('id name idNumber category sport')
      .lean();
    if (!player) throw new NotFoundException('No se encontró un jugador con ese DNI');

    if (player.sport && player.sport !== config.sport) {
      throw new BadRequestException('Este jugador pertenece a otro deporte');
    }

    const resolved = this.resolveAmountForCategory(config, player.category as CategoryEnum);
    if (!resolved) {
      throw new BadRequestException('Tu categoría no está incluida en este derecho de jugador');
    }

    if (resolved.blockExpiresAt && resolved.blockExpiresAt < new Date()) {
      throw new BadRequestException('El plazo de pago para tu categoría ha vencido');
    }

    const alreadyPaid = !!(await this.paymentModel.exists({
      playerId: (player as any)._id,
      configId: (config as any)._id,
      status: PlayerFeeStatusEnum.APPROVED,
    }));

    const discount = config.familyDiscount
      ? await this.resolveFamilyDiscount(config, (player as any)._id.toString(), config.sport)
      : null;

    const originalAmount = resolved.amount;
    const discountPct = discount?.discountPct ?? 0;
    const discountedAmount = discountPct
      ? Math.round(originalAmount * (1 - discountPct / 100))
      : originalAmount;
    const mpFeeAdded = config.addMpFee
      ? Math.round(discountedAmount * this.mpFeeRate)
      : 0;
    const totalAmount = discountedAmount + mpFeeAdded;

    return {
      playerId: (player as any)._id.toString(),
      playerName: player.name,
      playerDni: player.idNumber,
      category: player.category,
      blockName: resolved.blockName,
      originalAmount,
      discountPct: discountPct || undefined,
      discountReason: discount?.discountReason,
      finalAmount: discountedAmount,
      mpFeeAdded: mpFeeAdded || undefined,
      totalAmount,
      alreadyPaid,
    };
  }

  async initiatePlayerFeeCheckout(token: string, dni: string) {
    const config = await this.getConfigByToken(token);

    const player = await this.playerModel
      .findOne({ idNumber: dni.trim() })
      .select('id name idNumber category sport')
      .lean();
    if (!player) throw new NotFoundException('No se encontró un jugador con ese DNI');

    const alreadyPaid = await this.paymentModel.exists({
      playerId: (player as any)._id,
      configId: (config as any)._id,
      status: PlayerFeeStatusEnum.APPROVED,
    });
    if (alreadyPaid) throw new BadRequestException('Este jugador ya registró su pago');

    const resolved = this.resolveAmountForCategory(config, player.category as CategoryEnum);
    if (!resolved) throw new BadRequestException('Tu categoría no está incluida en este derecho de jugador');

    if (resolved.blockExpiresAt && resolved.blockExpiresAt < new Date()) {
      throw new BadRequestException('El plazo de pago para tu categoría ha vencido');
    }

    const discount = config.familyDiscount
      ? await this.resolveFamilyDiscount(config, (player as any)._id.toString(), config.sport)
      : null;

    const originalAmount = resolved.amount;
    const discountPct = discount?.discountPct ?? 0;
    const finalAmount = discountPct
      ? Math.round(originalAmount * (1 - discountPct / 100))
      : originalAmount;
    const mpFeeAdded = config.addMpFee ? Math.round(finalAmount * this.mpFeeRate) : 0;
    const totalAmount = finalAmount + mpFeeAdded;

    const externalReference = uuidv4();

    const payment = await this.paymentModel.create({
      playerId: (player as any)._id,
      configId: (config as any)._id,
      season: config.season,
      sport: config.sport,
      originalAmount,
      discountPct: discountPct || undefined,
      discountReason: discount?.discountReason,
      finalAmount,
      mpFeeAdded: mpFeeAdded || undefined,
      status: PlayerFeeStatusEnum.PENDING,
      paymentMethod: 'mercadopago',
      mpExternalReference: externalReference,
    });

    const preference = new Preference(this.mpClient);
    const mpResponse = await preference.create({
      body: {
        items: [
          {
            id: payment.id,
            title: `${config.label} ${config.season}`,
            description: config.description ?? config.label,
            quantity: 1,
            unit_price: totalAmount,
            currency_id: 'ARS',
          },
        ],
        payer: {
          name: player.name,
          identification: { type: 'DNI', number: player.idNumber },
        },
        external_reference: externalReference,
        back_urls: {
          success: `${this.appBaseUrl}/player-fee/result`,
          failure: `${this.appBaseUrl}/player-fee/result`,
          pending: `${this.appBaseUrl}/player-fee/result`,
        },
        ...(this.appBaseUrl.startsWith('https://') ? { auto_return: 'approved' as const } : {}),
        ...(resolved.blockExpiresAt ? { expiration_date_to: resolved.blockExpiresAt.toISOString() } : {}),
      },
    });

    await this.paymentModel.findByIdAndUpdate(payment.id, {
      mpPreferenceId: mpResponse.id,
    });

    const checkoutUrl = this.appBaseUrl.startsWith('https://')
      ? mpResponse.init_point
      : (mpResponse.sandbox_init_point ?? mpResponse.init_point);

    return { checkoutUrl };
  }

  async confirmPlayerFeePayment(dto: ConfirmPlayerFeeDto) {
    const payment = await this.paymentModel.findOne({
      mpExternalReference: dto.externalReference,
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');

    if (!dto.paymentId) {
      payment.status = this.mapMpStatus(dto.status ?? 'pending');
      await payment.save();
      return { status: payment.status };
    }

    const wasApproved = payment.status === PlayerFeeStatusEnum.APPROVED;

    try {
      const mpPayment = new MpPayment(this.mpClient);
      const mpData = await mpPayment.get({ id: dto.paymentId });
      payment.mpPaymentId = String(mpData.id);
      payment.mpStatusDetail = mpData.status_detail ?? undefined;
      payment.status = this.mapMpStatus(mpData.status ?? 'pending');
      if (mpData.status === 'approved') {
        payment.paidAt = mpData.date_approved ? new Date(mpData.date_approved) : new Date();
      }
      await payment.save();
    } catch {
      payment.status = this.mapMpStatus(dto.status ?? 'pending');
      await payment.save();
    }

    if (!wasApproved && payment.status === PlayerFeeStatusEnum.APPROVED) {
      const config = payment.configId
        ? await this.configModel.findById(payment.configId).lean()
        : null;
      await this.createPaymentRecord(payment, config, PaymentMethodEnum.MERCADOPAGO, payment.finalAmount, payment.paidAt!);
    }

    return { status: payment.status };
  }

  private mapMpStatus(mpStatus: string): PlayerFeeStatusEnum {
    switch (mpStatus) {
      case 'approved': return PlayerFeeStatusEnum.APPROVED;
      case 'rejected': return PlayerFeeStatusEnum.REJECTED;
      case 'cancelled': return PlayerFeeStatusEnum.CANCELLED;
      default: return PlayerFeeStatusEnum.PENDING;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async getConfigByToken(token: string) {
    const config = await this.configModel.findOne({ linkToken: token, active: true });
    if (!config) throw new NotFoundException('Link no encontrado o inactivo');
    return config;
  }

  resolveAmountForCategory(
    config: PlayerFeeConfigEntity,
    category: CategoryEnum
  ): { blockName: string; amount: number; blockExpiresAt: Date | undefined } | null {
    let baseAmount: number | null = null;
    let blockName = '';
    let blockExpiresAt: Date | undefined;

    for (const block of config.blocks) {
      if (block.categories.includes(category)) {
        baseAmount = block.amount;
        blockName = block.name;
        blockExpiresAt = block.expiresAt;
        break;
      }
    }

    if (baseAmount === null) return null;

    return { blockName, amount: baseAmount, blockExpiresAt };
  }

  // ── BDUAR bulk import ─────────────────────────────────────────────────────

  async importFromBduar(dto: BduarImportDto, userId: string) {
    let created = 0, updated = 0, recordsSet = 0;
    const details: { dni: string; name: string; action: string }[] = [];

    for (const row of dto.rows) {
      const dni = row.documento.trim();
      const name = `${row.nombre.trim()} ${row.apellido.trim()}`.trim();
      const isConfirmada = row.estado?.toLowerCase().trim() === 'confirmada';

      const height = this.parseHeight(row.estatura);
      const weight = this.parseWeight(row.peso);
      const position = this.mapBduarPosition(row.puesto);
      const _birthRaw = row.fechaNac ? new Date(row.fechaNac) : undefined;
      const birthDate = _birthRaw && !isNaN(_birthRaw.getTime()) ? _birthRaw : undefined;
      const bloodType = this.normalizeBduarBloodType(row.grupoSanguineo);
      const _bduarRawDate = row.fechaFichaje ? new Date(row.fechaFichaje) : undefined;
      const bduarRegistrationDate = _bduarRawDate && !isNaN(_bduarRawDate.getTime()) ? _bduarRawDate : undefined;

      const medicalData = (height !== null || weight !== null || row.oSocial || bloodType)
        ? {
            ...(height !== null && { height }),
            ...(weight !== null && { weight }),
            ...(row.oSocial?.trim() && { healthInsurance: row.oSocial.trim() }),
            ...(bloodType && { bloodType }),
          }
        : undefined;

      let player = await this.playerModel.findOne({ idNumber: dni });

      if (player) {
        // Never overwrite name/nickName/status — only update medical/bio data from BDUAR
        const updateData: Record<string, unknown> = {
          ...(birthDate && { birthDate }),
          ...(row.email?.trim() && { email: row.email.trim() }),
          ...(position && { positions: [position] }),
          ...(medicalData && { medicalData }),
        };
        if (Object.keys(updateData).length > 0) {
          await this.playerModel.findByIdAndUpdate(player._id, { $set: updateData });
        }
        updated++;
        details.push({ dni, name, action: 'updated' });
      } else {
        player = await this.playerModel.create({
          name,
          sport: SportEnum.RUGBY,
          status: PlayerStatusEnum.ACTIVE,
          idNumber: dni,
          nickName: '',
          ...(birthDate && { birthDate }),
          ...(row.email?.trim() && { email: row.email.trim() }),
          ...(position && { positions: [position] }),
          ...(medicalData && { medicalData }),
          createdBy: new Types.ObjectId(userId),
        });
        created++;
        details.push({ dni, name, action: 'created' });
      }

      if (isConfirmada) {
        const now = new Date();
        const playerId = (player as any)._id;

        await this.seasonRecordModel.findOneAndUpdate(
          { playerId, season: dto.season, sport: SportEnum.RUGBY },
          {
            $set: {
              membershipCurrent: true,
              bduarRegistered: true,
              ...(bduarRegistrationDate && { bduarRegistrationDate }),
              coursesApproved: true,
              coursesDate: now,
              solidarityFundPaid: true,
              solidarityFundDate: now,
              updatedBy: new Types.ObjectId(userId),
            },
          },
          { upsert: true, new: true }
        );

        const existingPayment = await this.paymentModel.findOne({
          playerId,
          season: dto.season,
          sport: SportEnum.RUGBY,
          status: PlayerFeeStatusEnum.APPROVED,
        });

        if (!existingPayment) {
          const config = await this.configModel.findOne({
            season: dto.season,
            sport: SportEnum.RUGBY,
            active: true,
          });
          await this.paymentModel.create({
            playerId,
            ...(config ? { configId: config._id } : {}),
            season: dto.season,
            sport: SportEnum.RUGBY,
            originalAmount: 0,
            finalAmount: 0,
            status: PlayerFeeStatusEnum.APPROVED,
            paymentMethod: 'bduar',
            paidAt: now,
          });
        }

        recordsSet++;
      }
    }

    return { total: dto.rows.length, created, updated, recordsSet };
  }

  private normalizeBduarBloodType(raw?: string): BloodTypeEnum | null {
    if (!raw) return null;
    // Normalize "0" (zero) to "O" (letter), then uppercase
    const normalized = raw.trim().toUpperCase().replace(/^0/, 'O');
    return Object.values(BloodTypeEnum).includes(normalized as BloodTypeEnum)
      ? (normalized as BloodTypeEnum)
      : null;
  }

  private parseHeight(raw?: string): number | null {
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.');
    const val = parseFloat(cleaned);
    if (isNaN(val)) return null;
    // If < 3 it's in meters (e.g. 1.83), multiply to cm
    return val < 3 ? Math.round(val * 100) : Math.round(val);
  }

  private parseWeight(raw?: string): number | null {
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d.]/g, '');
    const val = parseFloat(cleaned);
    if (isNaN(val)) return null;
    return Math.round(val);
  }

  private mapBduarPosition(raw?: string): RugbyPositions | null {
    if (!raw) return null;
    const match = raw.match(/^(\d+)/);
    if (!match) return null;
    const num = parseInt(match[1], 10).toString();
    return Object.values(RugbyPositions).includes(num as RugbyPositions)
      ? (num as RugbyPositions)
      : null;
  }

  private async createPaymentRecord(
    feePayment: any,
    config: any | null,
    method: string,
    amount: number,
    paidAt: Date,
  ): Promise<void> {
    const concept = config?.label ?? `Derecho ${feePayment.sport} ${feePayment.season}`;
    await this.generalPaymentModel.create({
      entityType: PaymentEntityTypeEnum.PLAYER_FEE,
      entityId: feePayment._id,
      playerId: feePayment.playerId,
      amount,
      method: method as PaymentMethodEnum,
      status: PaymentStatusEnum.APPROVED,
      concept,
      date: paidAt,
    });
  }

  async resolveFamilyDiscount(
    config: PlayerFeeConfigEntity,
    playerId: string,
    sport: SportEnum
  ): Promise<{ discountPct: number; discountReason: string } | null> {
    const group = await this.familyGroupModel.findOne({
      sport,
      'members.playerId': new Types.ObjectId(playerId),
    });
    if (!group || group.members.length < 2) return null;

    const memberIds = group.members.map((m) => m.playerId);
    const players = await this.playerModel
      .find({ _id: { $in: memberIds } })
      .select('_id category')
      .lean();

    // Build members list with their resolved amounts
    const membersWithAmounts = group.members
      .map((m) => {
        const player = players.find((p) => p._id.toString() === m.playerId.toString());
        if (!player) return null;
        const resolved = this.resolveAmountForCategory(config, player.category as CategoryEnum);
        if (!resolved) return null;
        return { playerId: m.playerId.toString(), order: m.order, amount: resolved.amount };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    if (membersWithAmounts.length < 2) return null;

    // Sort by amount DESC; tiebreaker: lower order (registered first) treated as "more expensive"
    membersWithAmounts.sort((a, b) => b.amount - a.amount || a.order - b.order);

    const rank = membersWithAmounts.findIndex((m) => m.playerId === playerId);
    if (rank <= 0) return null;

    if (rank === 1) {
      return { discountPct: 25, discountReason: '2do integrante del grupo familiar' };
    }
    return { discountPct: 50, discountReason: '3er integrante del grupo familiar o más' };
  }

  async migratePaymentRecords(): Promise<{ migrated: number; skipped: number }> {
    const approvedFees = await this.paymentModel
      .find({ status: PlayerFeeStatusEnum.APPROVED })
      .populate({ path: 'configId', select: 'label' })
      .lean();

    const existingEntityIds = new Set(
      (await this.generalPaymentModel
        .find({ entityType: PaymentEntityTypeEnum.PLAYER_FEE })
        .distinct('entityId'))
        .map((id) => id.toString())
    );

    let migrated = 0;
    let skipped = 0;

    const validMethods = Object.values(PaymentMethodEnum) as string[];

    for (const fee of approvedFees) {
      const feeId = (fee as any)._id.toString();
      if (existingEntityIds.has(feeId)) { skipped++; continue; }

      // Saltar registros BDUAR: sin monto real o método no estándar
      if (!fee.finalAmount || fee.finalAmount < 0.01) { skipped++; continue; }
      if (fee.paymentMethod && !validMethods.includes(fee.paymentMethod)) { skipped++; continue; }

      const config = fee.configId as any;
      const concept = config?.label ?? `Derecho ${fee.sport} ${fee.season}`;
      const method = fee.mpPaymentId
        ? PaymentMethodEnum.MERCADOPAGO
        : (fee.paymentMethod as PaymentMethodEnum | undefined) ?? PaymentMethodEnum.CASH;
      await this.generalPaymentModel.create({
        entityType: PaymentEntityTypeEnum.PLAYER_FEE,
        entityId:   (fee as any)._id,
        playerId:   fee.playerId,
        amount:     fee.finalAmount,
        method,
        status:     PaymentStatusEnum.APPROVED,
        concept,
        date:       fee.paidAt ?? fee.createdAt,
      });
      migrated++;
    }

    return { migrated, skipped };
  }
}
