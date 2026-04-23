import { Schema, Types } from 'mongoose';
import { FamilyGroupEntity } from './family-group.entity';
import { SportEnum } from '@ltrc-campo/shared-api-model';
import { PlayerEntity } from '../../players/schemas/player.entity';

const FamilyMemberSchema = new Schema(
  {
    playerId: { type: Types.ObjectId, ref: PlayerEntity.name, required: true },
    order: { type: Number, enum: [1, 2, 3], required: true },
  },
  { _id: false }
);

export const FamilyGroupSchema = new Schema<FamilyGroupEntity>(
  {
    name: { type: String, required: true },
    sport: { type: String, enum: Object.values(SportEnum), required: true },
    members: [FamilyMemberSchema],
    createdBy: { type: Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'family_groups' }
);

FamilyGroupSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

FamilyGroupSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => { delete ret._id; },
});
