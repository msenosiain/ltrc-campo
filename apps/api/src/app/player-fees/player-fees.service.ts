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
import { CreatePlayerFeeConfigDto } from './dto/create-player-fee-config.dto';
import { UpdatePlayerFeeConfigDto } from './dto/update-player-fee-config.dto';
import { CreateFamilyGroupDto } from './dto/create-family-group.dto';
import { UpdateSeasonRecordDto } from './dto/update-season-record.dto';
import { BduarImportDto } from './dto/bduar-import.dto';
import { ConfirmPlayerFeeDto } from './dto/validate-player-fee.dto';
import {
  CategoryEnum,
  PlayerFeeStatusEnum,
  PlayerStatusEnum,
  RugbyPositions,
  SportEnum,
  IPlayerFeeStatusRow,
} from '@ltrc-campo/shared-api-model';

// Rugby categories that require fondo solidario (M15 → PS)
const FONDO_SOLIDARIO_CATEGORIES = new Set<CategoryEnum>([
  CategoryEnum.M15,
  CategoryEnum.M16,
  CategoryEnum.M17,
  CategoryEnum.M19,
  CategoryEnum.PRE_DECIMA,
  CategoryEnum.DECIMA,
  CategoryEnum.NOVENA,
  CategoryEnum.OCTAVA,
  CategoryEnum.SEPTIMA,
  CategoryEnum.SEXTA,
  CategoryEnum.QUINTA,
  CategoryEnum.CUARTA,
  CategoryEnum.PLANTEL_SUPERIOR,
  CategoryEnum.MASTER,
]);

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
    private readonly configService: ConfigService,
  ) {
    this.mpFeeRate = parseFloat(
      this.configService.get<string>('MP_FEE_RATE') ?? '0.0599'
    );
    this.mpClient = new MercadoPagoConfig({
      accessToken: this.configService.get<string>('MP_ACCESS_TOKEN', ''),
    });
    this.appBaseUrl = this.configService.get<string>('APP_BASE_URL', 'http://localhost:4200');
  }

  // ── Config ────────────────────────────────────────────────────────────────

  async listConfigs() {
    return this.configModel.find().sort({ season: -1, sport: 1 }).lean();
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
      blocks: dto.blocks,
      priceTiers: dto.priceTiers?.map((t) => ({
        validUntil: new Date(t.validUntil),
        amountOverride: t.amountOverride,
      })),
      expiresAt: new Date(dto.expiresAt),
      linkToken,
      mpFeeRate: this.mpFeeRate,
      active: false,
      createdBy: new Types.ObjectId(userId),
    });
    return config;
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
    if (dto.blocks !== undefined) update['blocks'] = dto.blocks;
    if (dto.expiresAt) update['expiresAt'] = new Date(dto.expiresAt);
    if (dto.priceTiers !== undefined) {
      update['priceTiers'] = dto.priceTiers.map((t) => ({
        validUntil: new Date(t.validUntil),
        amountOverride: t.amountOverride,
      }));
    }
    const config = await this.configModel.findByIdAndUpdate(id, update, { new: true });
    if (!config) throw new NotFoundException('Configuración no encontrada');
    return config;
  }

  async activateConfig(id: string) {
    const config = await this.configModel.findById(id);
    if (!config) throw new NotFoundException('Configuración no encontrada');
    config.active = true;
    return config.save();
  }

  async deactivateConfig(id: string) {
    const config = await this.configModel.findById(id);
    if (!config) throw new NotFoundException('Configuración no encontrada');
    config.active = false;
    return config.save();
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
    return this.familyGroupModel
      .find()
      .populate({ path: 'members.playerId', select: 'name idNumber' })
      .sort({ name: 1 })
      .lean();
  }

  async createFamilyGroup(dto: CreateFamilyGroupDto, userId: string) {
    const members = dto.members.map((m) => ({
      playerId: new Types.ObjectId(m.playerId),
      order: m.order,
    }));
    return this.familyGroupModel.create({
      name: dto.name,
      sport: dto.sport,
      members,
      createdBy: new Types.ObjectId(userId),
    });
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
    return group;
  }

  async deleteFamilyGroup(id: string) {
    const group = await this.familyGroupModel.findByIdAndDelete(id);
    if (!group) throw new NotFoundException('Grupo familiar no encontrado');
    return { deleted: true };
  }

  // ── Season records ────────────────────────────────────────────────────────

  async updateSeasonRecord(playerId: string, dto: UpdateSeasonRecordDto, userId: string) {
    const update: Record<string, unknown> = {
      updatedBy: new Types.ObjectId(userId),
    };
    if (dto.fichaMedica !== undefined) update['fichaMedica'] = dto.fichaMedica;
    if (dto.fichaMedicaFecha) update['fichaMedicaFecha'] = new Date(dto.fichaMedicaFecha);
    if (dto.cursosAprobados !== undefined) update['cursosAprobados'] = dto.cursosAprobados;
    if (dto.cursosFecha) update['cursosFecha'] = new Date(dto.cursosFecha);
    if (dto.fichajeBDUAR !== undefined) update['fichajeBDUAR'] = dto.fichajeBDUAR;
    if (dto.fichajeUnion !== undefined) update['fichajeUnion'] = dto.fichajeUnion;
    if (dto.fondoSolidarioPagado !== undefined) update['fondoSolidarioPagado'] = dto.fondoSolidarioPagado;
    if (dto.fondoSolidarioFecha) update['fondoSolidarioFecha'] = new Date(dto.fondoSolidarioFecha);
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

  // ── Status list ───────────────────────────────────────────────────────────

  async getStatus(season: string, sport: SportEnum, category?: string): Promise<IPlayerFeeStatusRow[]> {
    const playerQuery: Record<string, unknown> = { sport, status: 'active' };
    if (category) playerQuery['category'] = category;

    const [players, configs] = await Promise.all([
      this.playerModel
        .find(playerQuery)
        .select('name idNumber category')
        .sort({ category: 1, name: 1 })
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
      const needsFondoSolidario = sport === SportEnum.RUGBY && FONDO_SOLIDARIO_CATEGORIES.has(cat);

      const feePaid = !!payment;
      const fichaMedica = record?.fichaMedica ?? false;
      const cursosAprobados = record?.cursosAprobados ?? false;
      const fichajeBDUAR = record?.fichajeBDUAR ?? false;
      const fichajeUnion = record?.fichajeUnion ?? false;
      const fondoSolidarioPagado = needsFondoSolidario
        ? (record?.fondoSolidarioPagado ?? false)
        : undefined;

      const habilitado =
        feePaid &&
        fichaMedica &&
        cursosAprobados &&
        fichajeBDUAR &&
        fichajeUnion &&
        (!needsFondoSolidario || fondoSolidarioPagado === true);

      return {
        playerId: pid,
        playerName: player.name,
        playerDni: player.idNumber ?? '',
        category: cat,
        feePaid,
        feeAmount: payment?.finalAmount,
        feePaidAt: payment?.paidAt,
        fichaMedica,
        cursosAprobados,
        fichajeBDUAR,
        fichajeUnion,
        fondoSolidarioPagado,
        habilitado,
      };
    });
  }

  async getStats(season: string, sport: SportEnum) {
    const rows = await this.getStatus(season, sport);
    const byCategory = new Map<string, { total: number; habilitados: number; pagados: number }>();

    for (const row of rows) {
      const cat = row.category;
      if (!byCategory.has(cat)) byCategory.set(cat, { total: 0, habilitados: 0, pagados: 0 });
      const entry = byCategory.get(cat)!;
      entry.total++;
      if (row.feePaid) entry.pagados++;
      if (row.habilitado) entry.habilitados++;
    }

    return {
      total: rows.length,
      pagados: rows.filter((r) => r.feePaid).length,
      habilitados: rows.filter((r) => r.habilitado).length,
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
      expiresAt: config.expiresAt,
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

    const alreadyPaid = !!(await this.paymentModel.exists({
      playerId: (player as any)._id,
      configId: (config as any)._id,
      status: PlayerFeeStatusEnum.APPROVED,
    }));

    const discount = config.familyDiscount
      ? await this.resolveFamilyDiscount(
          (config as any)._id.toString(),
          (player as any)._id.toString(),
          config.sport,
        )
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

    const discount = config.familyDiscount
      ? await this.resolveFamilyDiscount(
          (config as any)._id.toString(),
          (player as any)._id.toString(),
          config.sport,
        )
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
        expiration_date_to: config.expiresAt.toISOString(),
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
    if (new Date() > config.expiresAt) {
      throw new BadRequestException('Este link ha expirado');
    }
    return config;
  }

  resolveAmountForCategory(
    config: PlayerFeeConfigEntity,
    category: CategoryEnum
  ): { blockName: string; amount: number } | null {
    // Check price tiers first
    let baseAmount: number | null = null;
    let blockName = '';

    for (const block of config.blocks) {
      if (block.categories.includes(category)) {
        baseAmount = block.amount;
        blockName = block.name;
        break;
      }
    }

    if (baseAmount === null) return null;

    // Apply price tier if applicable
    if (config.priceTiers?.length) {
      const now = new Date();
      for (const tier of config.priceTiers) {
        if (now <= new Date(tier.validUntil)) {
          return { blockName, amount: tier.amountOverride };
        }
      }
    }

    return { blockName, amount: baseAmount };
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
      const birthDate = row.fechaNac ? new Date(row.fechaNac) : undefined;

      const playerData: Record<string, unknown> = {
        name,
        sport: SportEnum.RUGBY,
        status: PlayerStatusEnum.ACTIVE,
        ...(birthDate && { birthDate }),
        ...(row.email?.trim() && { email: row.email.trim() }),
        ...(position && { positions: [position] }),
        ...(height !== null || weight !== null || row.oSocial
          ? {
              medicalData: {
                ...(height !== null && { height }),
                ...(weight !== null && { weight }),
                ...(row.oSocial?.trim() && { healthInsurance: row.oSocial.trim() }),
              },
            }
          : {}),
      };

      let player = await this.playerModel.findOne({ idNumber: dni });

      if (player) {
        await this.playerModel.findByIdAndUpdate(player._id, { $set: playerData });
        updated++;
        details.push({ dni, name, action: 'updated' });
      } else {
        player = await this.playerModel.create({
          ...playerData,
          idNumber: dni,
          nickName: '',
          createdBy: new Types.ObjectId(userId),
        });
        created++;
        details.push({ dni, name, action: 'created' });
      }

      if (isConfirmada) {
        const now = new Date();
        await this.seasonRecordModel.findOneAndUpdate(
          { playerId: (player as any)._id, season: dto.season, sport: SportEnum.RUGBY },
          {
            $set: {
              fichaMedica: true,
              fichaMedicaFecha: now,
              cursosAprobados: true,
              cursosFecha: now,
              fichajeBDUAR: true,
              fichajeUnion: true,
              fondoSolidarioPagado: true,
              fondoSolidarioFecha: now,
              updatedBy: new Types.ObjectId(userId),
            },
          },
          { upsert: true, new: true }
        );
        recordsSet++;
      }
    }

    return { total: dto.rows.length, created, updated, recordsSet };
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

  async resolveFamilyDiscount(
    configId: string,
    playerId: string,
    sport: SportEnum
  ): Promise<{ discountPct: number; discountReason: string } | null> {
    const group = await this.familyGroupModel.findOne({
      sport,
      'members.playerId': new Types.ObjectId(playerId),
    });
    if (!group) return null;

    const member = group.members.find((m) => m.playerId.toString() === playerId);
    if (!member || member.order === 1) return null;

    // Count how many members of this group already paid for this config
    const memberIds = group.members.map((m) => m.playerId);
    const paidCount = await this.paymentModel.countDocuments({
      configId: new Types.ObjectId(configId),
      playerId: { $in: memberIds },
      status: PlayerFeeStatusEnum.APPROVED,
    });

    if (member.order === 2 || paidCount >= 1) {
      return { discountPct: 25, discountReason: '2do integrante del grupo familiar' };
    }
    if (member.order >= 3) {
      return { discountPct: 50, discountReason: '3er integrante del grupo familiar o más' };
    }

    return null;
  }
}
