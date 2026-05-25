import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CategoryEnum, RoleEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { SquadEntity } from './schemas/squad.entity';
import { CreateSquadDto } from './dto/create-squad.dto';
import { UpdateSquadDto } from './dto/update-squad.dto';
import { User } from '../users/schemas/user.schema';

const POPULATE_PLAYERS = [{ path: 'players.player' }];

@Injectable()
export class SquadsService {
  constructor(
    @InjectModel(SquadEntity.name)
    private readonly squadModel: Model<SquadEntity>
  ) {}

  async create(dto: CreateSquadDto, caller?: User) {
    const callerId = caller ? (caller as any)._id : undefined;
    const squad = await this.squadModel.create({
      name: dto.name,
      sport: dto.sport,
      category: dto.category,
      players: dto.players.map(({ shirtNumber, playerId }) => ({
        shirtNumber,
        player: playerId as any,
      })),
      createdBy: callerId,
      updatedBy: callerId,
    });
    return squad!.populate(POPULATE_PLAYERS);
  }

  async findAll(sport?: SportEnum, category?: CategoryEnum, caller?: User) {
    let filter: Record<string, unknown> = {
      ...(sport && { sport }),
      ...(category && { category }),
    };

    // Server-side restriction: limit results to user's assigned scope
    if (caller && !caller.roles?.includes(RoleEnum.ADMIN)) {
      if (caller.categories?.length) {
        filter = {
          ...(sport && { sport }),
          category: { $in: caller.categories },
        };
      }
    }

    return this.squadModel
      .find(filter)
      .sort({ name: 1 })
      .populate(POPULATE_PLAYERS)
      .exec();
  }

  async findOne(id: string) {
    const squad = await this.squadModel.findById(id).populate(POPULATE_PLAYERS);
    if (!squad) throw new NotFoundException('Squad not found');
    return squad;
  }

  async update(id: string, dto: UpdateSquadDto, caller?: User) {
    const squad = await this.squadModel.findById(id);
    if (!squad) throw new NotFoundException('Squad not found');

    if (dto.name) squad.name = dto.name;
    if (dto.sport !== undefined) squad.sport = dto.sport;
    if (dto.category !== undefined) squad.category = dto.category;
    if (dto.players) {
      squad.set(
        'players',
        dto.players.map(({ shirtNumber, playerId }) => ({
          shirtNumber,
          player: playerId,
        }))
      );
    }
    if (caller) squad.updatedBy = (caller as any)._id;

    return (await squad.save()).populate(POPULATE_PLAYERS);
  }

  async delete(id: string) {
    const squad = await this.squadModel.findById(id);
    if (!squad) throw new NotFoundException('Squad not found');
    return squad.deleteOne();
  }

  async getPlayers(id: string) {
    const squad = await this.findOne(id);
    return squad.players;
  }
}
