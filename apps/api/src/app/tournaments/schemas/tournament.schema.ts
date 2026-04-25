import { Schema, Types } from 'mongoose';
import { TournamentEntity } from './tournament.entity';
import { CategoryEnum, MatchTypeEnum, SportEnum } from '@ltrc-campo/shared-api-model';

const TournamentAttachmentSchema = new Schema(
  {
    fileId: { type: String, required: true },
    filename: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

TournamentAttachmentSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

TournamentAttachmentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
  },
});

export const TournamentSchema = new Schema<TournamentEntity>(
  {
    name: { type: String, required: true },
    season: { type: String },
    description: { type: String },
    sport: { type: String, enum: Object.values(SportEnum) },
    categories: [{ type: String, enum: Object.values(CategoryEnum) }],
    type: { type: String, enum: Object.values(MatchTypeEnum) },
    logoFileId: { type: String },
    attachments: { type: [TournamentAttachmentSchema], default: [] },
    createdBy: { type: Types.ObjectId, ref: 'User' },
    updatedBy: { type: Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'tournaments',
  }
);

TournamentSchema.virtual('id').get(function () {
  return (this._id as Types.ObjectId).toHexString();
});

TournamentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
  },
});
