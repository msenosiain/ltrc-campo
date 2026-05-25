import { Document } from 'mongoose';
import { CategoryEnum, SportEnum } from '../enums';
import { Player } from './player.interface';

export interface SquadPlayerTemplate {
  shirtNumber: number;
  player: Player;
}

export interface Squad extends Document {
  readonly id?: string;
  readonly name: string;
  readonly sport?: SportEnum;
  readonly category?: CategoryEnum;
  readonly players: SquadPlayerTemplate[];
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}
