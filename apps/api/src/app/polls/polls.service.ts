import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomUUID } from 'crypto';
import { MatchPollEntity } from './schemas/match-poll.entity';
import { MatchEntity } from '../matches/schemas/match.entity';
import { CreatePollDto } from './dto/create-poll.dto';
import { CastVoteDto } from './dto/cast-vote.dto';
import {
  MatchPoll,
  MatchPollPublicInfo,
  PollResults,
  PollPlayerResult,
} from '@ltrc-campo/shared-api-model';

@Injectable()
export class PollsService {
  constructor(
    @InjectModel(MatchPollEntity.name)
    private readonly pollModel: Model<MatchPollEntity>,
    @InjectModel(MatchEntity.name)
    private readonly matchModel: Model<MatchEntity>
  ) {}

  async createPoll(matchId: string, dto: CreatePollDto, callerId?: string): Promise<MatchPoll> {
    const existing = await this.pollModel.findOne({ matchId: new Types.ObjectId(matchId) });
    if (existing) throw new ConflictException('Este partido ya tiene una votación activa');

    const match = await this.matchModel.findById(matchId);
    if (!match) throw new NotFoundException('Partido no encontrado');
    if (!match.squad?.length) throw new BadRequestException('El partido no tiene plantel convocado');

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('La fecha de cierre debe ser posterior a la de inicio');

    const slug = await this.generateSlug(new Date((match as any).date));

    const poll = await this.pollModel.create({
      matchId: new Types.ObjectId(matchId),
      token: randomUUID(),
      slug,
      startsAt,
      endsAt,
      votes: [],
      createdBy: callerId ? new Types.ObjectId(callerId) : undefined,
    });

    return this.toMatchPoll(poll);
  }

  async getPollForMatch(matchId: string): Promise<MatchPoll | null> {
    const poll = await this.pollModel.findOne({ matchId: new Types.ObjectId(matchId) });
    if (!poll) return null;
    return this.toMatchPoll(poll);
  }

  async updatePoll(matchId: string, dto: Partial<CreatePollDto>): Promise<MatchPoll> {
    const poll = await this.pollModel.findOne({ matchId: new Types.ObjectId(matchId) });
    if (!poll) throw new NotFoundException('Votación no encontrada');

    if (dto.startsAt) poll.startsAt = new Date(dto.startsAt);
    if (dto.endsAt) poll.endsAt = new Date(dto.endsAt);

    if (poll.endsAt <= poll.startsAt) throw new BadRequestException('La fecha de cierre debe ser posterior a la de inicio');

    await poll.save();
    return this.toMatchPoll(poll);
  }

  async deletePoll(matchId: string): Promise<void> {
    const result = await this.pollModel.deleteOne({ matchId: new Types.ObjectId(matchId) });
    if (result.deletedCount === 0) throw new NotFoundException('Votación no encontrada');
  }

  async getPublicInfo(slug: string): Promise<MatchPollPublicInfo> {
    const poll = await this.pollModel.findOne({ slug }) ?? await this.pollModel.findOne({ token: slug });
    if (!poll) throw new NotFoundException('Votación no encontrada');

    const match = await this.matchModel
      .findById(poll.matchId)
      .populate<{ squad: { shirtNumber: number; posterLabel?: string; player: { _id: Types.ObjectId; name: string } }[] }>('squad.player');

    if (!match) throw new NotFoundException('Partido no encontrado');

    const now = new Date();
    const isActive = now >= poll.startsAt && now <= poll.endsAt;
    const isClosed = now > poll.endsAt;

    return {
      token: poll.slug,
      matchTitle: this.buildMatchTitle(match as any),
      isActive,
      isClosed,
      startsAt: poll.startsAt,
      endsAt: poll.endsAt,
      squad: match.squad.map((e) => ({
        playerId: (e.player as any)._id.toHexString(),
        playerName: (e.player as any).name,
        shirtNumber: e.shirtNumber,
        posterLabel: e.posterLabel,
      })),
    };
  }

  async castVote(slug: string, dto: CastVoteDto, ip: string, userAgent: string): Promise<{ voted: true; totalVotes: number }> {
    const poll = await this.pollModel.findOne({ slug }) ?? await this.pollModel.findOne({ token: slug });
    if (!poll) throw new NotFoundException('Votación no encontrada');

    const now = new Date();
    if (now < poll.startsAt) throw new BadRequestException('La votación aún no ha comenzado');
    if (now > poll.endsAt) throw new BadRequestException('La votación ha finalizado');

    const fingerprint = this.computeFingerprint(ip, userAgent, poll.token);
    const alreadyVoted = poll.votes.some((v) => v.fingerprint === fingerprint);
    if (alreadyVoted) throw new ConflictException('Ya emitiste tu voto');

    const match = await this.matchModel.findById(poll.matchId);
    if (!match) throw new NotFoundException('Partido no encontrado');

    const validPlayer = match.squad.some(
      (e) => (e.player as any).toString() === dto.playerId || (e.player as Types.ObjectId).toHexString() === dto.playerId
    );
    if (!validPlayer) throw new BadRequestException('El jugador no pertenece al plantel convocado');

    poll.votes.push({
      fingerprint,
      playerId: new Types.ObjectId(dto.playerId),
      votedAt: new Date(),
    });
    await poll.save();

    return { voted: true, totalVotes: poll.votes.length };
  }

  async getResults(slug: string): Promise<PollResults> {
    const poll = await this.pollModel.findOne({ slug }) ?? await this.pollModel.findOne({ token: slug });
    if (!poll) throw new NotFoundException('Votación no encontrada');

    const match = await this.matchModel
      .findById(poll.matchId)
      .populate<{ squad: { shirtNumber: number; player: { _id: Types.ObjectId; name: string } }[] }>('squad.player');

    if (!match) throw new NotFoundException('Partido no encontrado');

    const now = new Date();
    const isActive = now >= poll.startsAt && now <= poll.endsAt;
    const isClosed = now > poll.endsAt;

    const totalVotes = poll.votes.length;
    const voteCounts = new Map<string, number>();
    for (const vote of poll.votes) {
      const id = vote.playerId.toHexString();
      voteCounts.set(id, (voteCounts.get(id) ?? 0) + 1);
    }

    const results: PollPlayerResult[] = match.squad.map((e) => {
      const id = (e.player as any)._id.toHexString();
      const votes = voteCounts.get(id) ?? 0;
      return {
        playerId: id,
        playerName: (e.player as any).name,
        shirtNumber: e.shirtNumber,
        votes,
        percentage: totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0,
      };
    });

    const top3 = results
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 3)
      .filter((r) => r.votes > 0);

    return { totalVotes, top3, isActive, isClosed };
  }

  private async generateSlug(matchDate: Date): Promise<string> {
    const d = String(matchDate.getUTCDate()).padStart(2, '0');
    const m = String(matchDate.getUTCMonth() + 1).padStart(2, '0');
    const y = matchDate.getUTCFullYear();
    const base = `${d}-${m}-${y}`;

    const exists = await this.pollModel.findOne({ slug: base });
    if (!exists) return base;

    for (let i = 2; i <= 9; i++) {
      const candidate = `${base}-${i}`;
      const conflict = await this.pollModel.findOne({ slug: candidate });
      if (!conflict) return candidate;
    }
    return `${base}-${randomUUID().slice(0, 6)}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildMatchTitle(match: any): string {
    if ((match as any).opponent) return `vs ${(match as any).opponent}`;
    if ((match as any).name) return (match as any).name;
    return 'Encuentro';
  }

  private toMatchPoll(poll: MatchPollEntity): MatchPoll {
    const now = new Date();
    return {
      id: poll.id,
      matchId: poll.matchId.toHexString(),
      token: poll.token,
      slug: poll.slug ?? poll.token,
      startsAt: poll.startsAt,
      endsAt: poll.endsAt,
      totalVotes: poll.votes.length,
      isActive: now >= poll.startsAt && now <= poll.endsAt,
      isClosed: now > poll.endsAt,
      createdAt: poll.createdAt,
      updatedAt: poll.updatedAt,
    };
  }

  computeFingerprint(ip: string, userAgent: string, token: string): string {
    return createHash('sha256').update(`${ip}:${userAgent}:${token}`).digest('hex');
  }
}
