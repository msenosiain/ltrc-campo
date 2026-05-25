import { Document, PopulatedDoc, Types } from 'mongoose';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { PlayerEntity } from '../../players/schemas/player.entity';

export class SquadEntity extends Document {
  id: string;
  name: string;
  sport?: SportEnum;
  category?: CategoryEnum;
  players: {
    shirtNumber: number;
    player: PopulatedDoc<PlayerEntity & Document>;
  }[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
