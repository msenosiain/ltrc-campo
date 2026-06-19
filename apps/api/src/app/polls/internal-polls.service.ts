import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { InternalPollEntity } from './schemas/internal-poll.entity';
import { MatchEntity } from '../matches/schemas/match.entity';
import { User } from '../users/schemas/user.schema';
import { CreateInternalPollDto } from './dto/create-internal-poll.dto';
import { CastInternalVotesDto } from './dto/cast-internal-votes.dto';
import {
  InternalPoll,
  InternalPollAwardResult,
  InternalPollInfo,
  InternalPollResults,
  RoleEnum,
} from '@ltrc-campo/shared-api-model';

const STAFF_ROLES: RoleEnum[] = [RoleEnum.COACH, RoleEnum.TRAINER, RoleEnum.ANALYST, RoleEnum.KINE];
const ADMIN_ROLES: RoleEnum[] = [RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER, RoleEnum.COACH];
const BASE_VOTING_URL = process.env['INTERNAL_POLL_BASE_URL'] ?? 'https://campo.lostordos.com.ar';

@Injectable()
export class InternalPollsService {
  constructor(
    @InjectModel(InternalPollEntity.name)
    private readonly pollModel: Model<InternalPollEntity>,
    @InjectModel(MatchEntity.name)
    private readonly matchModel: Model<MatchEntity>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>
  ) {}

  async createPoll(matchId: string, dto: CreateInternalPollDto, callerId: string): Promise<InternalPoll> {
    const existing = await this.pollModel.findOne({ matchId: new Types.ObjectId(matchId) });
    if (existing) throw new ConflictException('Este partido ya tiene una votación interna');

    const match = await this.matchModel.findById(matchId).populate<{
      squad: { shirtNumber: number; player: { _id: Types.ObjectId; name: string } }[];
    }>('squad.player');
    if (!match) throw new NotFoundException('Partido no encontrado');
    if (!match.squad?.length) throw new BadRequestException('Para crear una votación interna, primero debés convocar jugadores al partido.');

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('La fecha de cierre debe ser posterior a la de inicio');

    const awards = dto.awards.map((a) => ({ id: randomUUID().slice(0, 8), name: a.name }));

    // Squad players → weight 1
    const squadVoters = match.squad
      .filter((e) => e.player)
      .map((e) => ({
        userId: (e.player as any)._id as Types.ObjectId,
        name: (e.player as any).name as string,
        weight: 1 as const,
      }));

    // Staff voters → weight 2 (deduplicate against squad)
    const squadUserIds = new Set(squadVoters.map((v) => v.userId.toHexString()));
    let staffVoters: { userId: Types.ObjectId; name: string; weight: 2 }[] = [];
    if (dto.staffVoterIds?.length) {
      const staffUsers = await this.userModel
        .find({ _id: { $in: dto.staffVoterIds.map((id) => new Types.ObjectId(id)) } })
        .select('name roles')
        .exec();

      staffVoters = staffUsers
        .filter((u) => !squadUserIds.has((u._id as Types.ObjectId).toHexString()))
        .map((u) => ({
          userId: u._id as Types.ObjectId,
          name: u.name,
          weight: 2 as const,
        }));
    }

    const poll = await this.pollModel.create({
      matchId: new Types.ObjectId(matchId),
      awards,
      startsAt,
      endsAt,
      voters: [...squadVoters, ...staffVoters],
      votes: [],
      createdBy: new Types.ObjectId(callerId),
    });

    return this.toInternalPoll(poll, matchId);
  }

  async getPoll(matchId: string): Promise<InternalPoll | null> {
    const poll = await this.pollModel.findOne({ matchId: new Types.ObjectId(matchId) });
    if (!poll) return null;
    return this.toInternalPoll(poll, matchId);
  }

  async updatePoll(matchId: string, dto: Partial<CreateInternalPollDto>): Promise<InternalPoll> {
    const poll = await this.pollModel.findOne({ matchId: new Types.ObjectId(matchId) });
    if (!poll) throw new NotFoundException('Votación interna no encontrada');

    if (dto.startsAt) poll.startsAt = new Date(dto.startsAt);
    if (dto.endsAt) poll.endsAt = new Date(dto.endsAt);

    if (poll.endsAt <= poll.startsAt) throw new BadRequestException('La fecha de cierre debe ser posterior a la de inicio');

    if (dto.awards?.length) {
      // Preserve existing ids to avoid breaking votes; add new; remove unlisted
      const existingMap = new Map(poll.awards.map((a) => [a.name.toLowerCase(), a.id]));
      poll.awards = dto.awards.map((a) => ({
        id: existingMap.get(a.name.toLowerCase()) ?? randomUUID().slice(0, 8),
        name: a.name,
      }));
    }

    if (dto.staffVoterIds !== undefined) {
      const squadVoters = poll.voters.filter((v) => v.weight === 1);
      const squadUserIds = new Set(squadVoters.map((v) => v.userId.toHexString()));

      let staffVoters: { userId: Types.ObjectId; name: string; weight: 2 }[] = [];
      if (dto.staffVoterIds.length) {
        const staffUsers = await this.userModel
          .find({ _id: { $in: dto.staffVoterIds.map((id) => new Types.ObjectId(id)) } })
          .select('name')
          .exec();
        staffVoters = staffUsers
          .filter((u) => !squadUserIds.has((u._id as Types.ObjectId).toHexString()))
          .map((u) => ({ userId: u._id as Types.ObjectId, name: u.name, weight: 2 as const }));
      }
      poll.voters = [...squadVoters, ...staffVoters];
    }

    await poll.save();
    return this.toInternalPoll(poll, matchId);
  }

  async deletePoll(matchId: string): Promise<void> {
    const result = await this.pollModel.deleteOne({ matchId: new Types.ObjectId(matchId) });
    if (result.deletedCount === 0) throw new NotFoundException('Votación interna no encontrada');
  }

  async getInfo(matchId: string, userId: string): Promise<InternalPollInfo> {
    const poll = await this.pollModel.findOne({ matchId: new Types.ObjectId(matchId) });
    if (!poll) throw new NotFoundException('Votación interna no encontrada');

    const match = await this.matchModel.findById(matchId).populate<{
      squad: { shirtNumber: number; player: { _id: Types.ObjectId; name: string } }[];
    }>('squad.player');
    if (!match) throw new NotFoundException('Partido no encontrado');

    const now = new Date();
    const isActive = now >= poll.startsAt && now <= poll.endsAt;
    const isClosed = now > poll.endsAt;

    const voter = poll.voters.find((v) => v.userId.toHexString() === userId);
    const isEligible = !!voter;

    const userVotes = poll.votes.filter((v) => v.userId.toHexString() === userId);
    const hasVoted = userVotes.length === poll.awards.length && poll.awards.length > 0;

    return {
      matchId,
      awards: poll.awards.map((a) => ({ id: a.id, name: a.name })),
      squad: match.squad
        .filter((e) => e.player)
        .map((e) => ({
          playerId: (e.player as any)._id.toHexString(),
          playerName: (e.player as any).name,
          shirtNumber: e.shirtNumber,
        })),
      startsAt: poll.startsAt,
      endsAt: poll.endsAt,
      isActive,
      isClosed,
      isEligible,
      hasVoted,
      myVotes: userVotes.map((v) => ({ awardId: v.awardId, playerId: v.playerId.toHexString() })),
    };
  }

  async castVotes(matchId: string, dto: CastInternalVotesDto, userId: string): Promise<{ voted: true }> {
    const poll = await this.pollModel.findOne({ matchId: new Types.ObjectId(matchId) });
    if (!poll) throw new NotFoundException('Votación interna no encontrada');

    const now = new Date();
    if (now < poll.startsAt) throw new BadRequestException('La votación aún no ha comenzado');
    if (now > poll.endsAt) throw new BadRequestException('La votación ha finalizado');

    const voter = poll.voters.find((v) => v.userId.toHexString() === userId);
    if (!voter) throw new ForbiddenException('No estás habilitado para votar en este partido');

    const awardIds = new Set(poll.awards.map((a) => a.id));
    const alreadyVotedAwards = new Set(
      poll.votes.filter((v) => v.userId.toHexString() === userId).map((v) => v.awardId)
    );

    const match = await this.matchModel.findById(matchId);
    const squadPlayerIds = new Set(
      match!.squad.map((e) => (e.player as any).toString())
    );

    for (const entry of dto.votes) {
      if (!awardIds.has(entry.awardId)) throw new BadRequestException(`Premio inválido: ${entry.awardId}`);
      if (alreadyVotedAwards.has(entry.awardId)) throw new ConflictException(`Ya votaste para el premio ${entry.awardId}`);
      if (!squadPlayerIds.has(entry.playerId) && !squadPlayerIds.has(new Types.ObjectId(entry.playerId).toHexString())) {
        throw new BadRequestException('El jugador no pertenece al plantel convocado');
      }
    }

    const newVotes = dto.votes.map((entry) => ({
      userId: new Types.ObjectId(userId),
      awardId: entry.awardId,
      playerId: new Types.ObjectId(entry.playerId),
      votedAt: new Date(),
    }));

    poll.votes.push(...newVotes);
    await poll.save();

    return { voted: true };
  }

  async getResults(matchId: string, requesterId: string, requesterRoles: RoleEnum[]): Promise<InternalPollResults> {
    const poll = await this.pollModel.findOne({ matchId: new Types.ObjectId(matchId) });
    if (!poll) throw new NotFoundException('Votación interna no encontrada');

    const now = new Date();
    const isActive = now >= poll.startsAt && now <= poll.endsAt;
    const isClosed = now > poll.endsAt;

    const isAdmin = requesterRoles.some((r) => ADMIN_ROLES.includes(r));
    if (!isAdmin && !isClosed) throw new ForbiddenException('Los resultados estarán disponibles cuando cierre la votación');

    const match = await this.matchModel.findById(matchId).populate<{
      squad: { shirtNumber: number; player: { _id: Types.ObjectId; name: string } }[];
    }>('squad.player');
    if (!match) throw new NotFoundException('Partido no encontrado');

    const voterWeightMap = new Map(poll.voters.map((v) => [v.userId.toHexString(), v.weight]));
    const squadMap = new Map(
      match.squad
        .filter((e) => e.player)
        .map((e) => [
          (e.player as any)._id.toHexString(),
          { playerName: (e.player as any).name, shirtNumber: e.shirtNumber },
        ])
    );

    const totalVoted = new Set(poll.votes.map((v) => v.userId.toHexString())).size;

    const awardResults: InternalPollAwardResult[] = poll.awards.map((award) => {
      const awardVotes = poll.votes.filter((v) => v.awardId === award.id);
      const pointsMap = new Map<string, number>();

      for (const vote of awardVotes) {
        const pid = vote.playerId.toHexString();
        const weight = voterWeightMap.get(vote.userId.toHexString()) ?? 1;
        pointsMap.set(pid, (pointsMap.get(pid) ?? 0) + weight);
      }

      const totalPoints = Array.from(pointsMap.values()).reduce((s, n) => s + n, 0);

      const top = Array.from(pointsMap.entries())
        .map(([playerId, points]) => {
          const info = squadMap.get(playerId);
          return {
            playerId,
            playerName: info?.playerName ?? 'Desconocido',
            shirtNumber: info?.shirtNumber ?? 0,
            points,
            percentage: totalPoints > 0 ? Math.round((points / totalPoints) * 100) : 0,
          };
        })
        .sort((a, b) => b.points - a.points)
        .slice(0, 3)
        .filter((r) => r.points > 0);

      return { awardId: award.id, awardName: award.name, top, totalPoints };
    });

    return {
      isActive,
      isClosed,
      totalVoted,
      totalVoters: poll.voters.length,
      awards: awardResults,
    };
  }

  async searchStaff(searchTerm: string): Promise<{ id: string; name: string; roles: RoleEnum[] }[]> {
    const users = await this.userModel
      .find({
        roles: { $in: STAFF_ROLES },
        ...(searchTerm ? { name: { $regex: new RegExp(searchTerm, 'i') } } : {}),
      })
      .select('name roles')
      .limit(20)
      .exec();

    return users.map((u) => ({
      id: (u._id as Types.ObjectId).toHexString(),
      name: u.name,
      roles: u.roles,
    }));
  }

  private toInternalPoll(poll: InternalPollEntity, matchId: string): InternalPoll {
    const now = new Date();
    const votedUserIds = new Set(poll.votes.map((v) => v.userId.toHexString()));
    return {
      id: poll.id,
      matchId,
      awards: poll.awards.map((a) => ({ id: a.id, name: a.name })),
      startsAt: poll.startsAt,
      endsAt: poll.endsAt,
      voters: poll.voters.map((v) => ({
        userId: v.userId.toHexString(),
        name: v.name,
        weight: v.weight,
      })),
      totalVoters: poll.voters.length,
      totalVoted: votedUserIds.size,
      isActive: now >= poll.startsAt && now <= poll.endsAt,
      isClosed: now > poll.endsAt,
      votingUrl: `${BASE_VOTING_URL}/votar-interno/${matchId}`,
      createdAt: poll.createdAt,
      updatedAt: poll.updatedAt,
    };
  }
}
