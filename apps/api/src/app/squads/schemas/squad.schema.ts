import { Schema, Types } from 'mongoose';
import { SquadEntity } from './squad.entity';
import { PlayerEntity } from '../../players/schemas/player.entity';

const SquadPlayerSchema = new Schema(
  {
    shirtNumber: { type: Number, required: true, min: 1, max: 26 },
    player: { type: Types.ObjectId, ref: PlayerEntity.name, required: true },
  },
  { _id: false }
);

export const SquadSchema = new Schema<SquadEntity>(
  {
    name: { type: String, required: true },
    sport: { type: String },
    category: { type: String },
    players: [SquadPlayerSchema],
    createdBy: { type: Types.ObjectId, ref: 'User' },
    updatedBy: { type: Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'squads',
  }
);

SquadSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

SquadSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
  },
});
