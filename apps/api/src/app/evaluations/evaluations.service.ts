import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CategoryEnum,
  EvaluationLevelEnum,
  EvaluationScore,
  EvaluationSkillEnum,
  RUGBY_SKILL_CRITERIA,
  SportEnum,
  scoreToLevel,
} from '@ltrc-campo/shared-api-model';
import { PlayerEvaluationEntity } from './schemas/player-evaluation.entity';
import { EvaluationSettingsEntity } from './schemas/evaluation-settings.entity';
import { UpsertEvaluationDto, SkillInputDto } from './dto/upsert-evaluation.dto';
import { ToggleEvaluationSettingsDto } from './dto/toggle-evaluation-settings.dto';

@Injectable()
export class EvaluationsService {
  constructor(
    @InjectModel(PlayerEvaluationEntity.name)
    private readonly evaluationModel: Model<PlayerEvaluationEntity>,
    @InjectModel(EvaluationSettingsEntity.name)
    private readonly settingsModel: Model<EvaluationSettingsEntity>,
  ) {}

  // ── Settings ────────────────────────────────────────────────────────────────

  async getAllSettings(): Promise<EvaluationSettingsEntity[]> {
    return this.settingsModel.find().exec();
  }

  async getSettings(category: CategoryEnum, sport: SportEnum): Promise<EvaluationSettingsEntity | null> {
    return this.settingsModel.findOne({ category, sport }).exec();
  }

  async toggleSettings(dto: ToggleEvaluationSettingsDto, userId: string): Promise<EvaluationSettingsEntity> {
    return this.settingsModel.findOneAndUpdate(
      { category: dto.category, sport: dto.sport },
      {
        evaluationsEnabled: dto.evaluationsEnabled,
        updatedBy: new Types.ObjectId(userId),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();
  }

  // ── Evaluations ──────────────────────────────────────────────────────────────

  async upsert(dto: UpsertEvaluationDto, evaluatedById: string): Promise<PlayerEvaluationEntity> {
    const computed = this.computeSkills(dto.skills);
    return this.evaluationModel.findOneAndUpdate(
      { player: new Types.ObjectId(dto.playerId), period: dto.period, sport: dto.sport },
      {
        player: new Types.ObjectId(dto.playerId),
        category: dto.category,
        sport: dto.sport,
        period: dto.period,
        evaluatedBy: new Types.ObjectId(evaluatedById),
        date: new Date(dto.date),
        skills: computed.skills,
        overallTotal: computed.overallTotal,
        overallLevel: computed.overallLevel,
        notes: dto.notes,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate('player', 'name nickName').exec();
  }

  async findByCategory(
    category: CategoryEnum | undefined,
    sport: SportEnum | undefined,
    period: string,
  ): Promise<PlayerEvaluationEntity[]> {
    const query: Record<string, unknown> = { period };
    if (category) query['category'] = category;
    if (sport) query['sport'] = sport;
    return this.evaluationModel
      .find(query)
      .populate('player', 'name nickName')
      .sort({ 'player.name': 1 })
      .exec();
  }

  async findByPlayer(playerId: string): Promise<PlayerEvaluationEntity[]> {
    return this.evaluationModel
      .find({ player: new Types.ObjectId(playerId) })
      .sort({ period: -1 })
      .exec();
  }

  async findOne(id: string): Promise<PlayerEvaluationEntity> {
    const doc = await this.evaluationModel
      .findById(id)
      .populate('player', 'name nickName')
      .exec();
    if (!doc) throw new NotFoundException('Evaluación no encontrada');
    return doc;
  }

  async delete(id: string): Promise<void> {
    const result = await this.evaluationModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException('Evaluación no encontrada');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private computeSkills(skillInputs: SkillInputDto[]) {
    const skills = skillInputs.map((s) => {
      const avg = s.subcriteria.reduce((sum, c) => sum + c.score, 0) / (s.subcriteria.length || 1);
      const total = Math.round(avg * 100) / 100;
      return {
        skill: s.skill,
        subcriteria: s.subcriteria,
        total,
        level: scoreToLevel(total),
      };
    });

    const overallTotal =
      Math.round(
        (skills.reduce((sum, s) => sum + s.total, 0) / (skills.length || 1)) * 100
      ) / 100;

    return {
      skills,
      overallTotal,
      overallLevel: scoreToLevel(overallTotal),
    };
  }
}
